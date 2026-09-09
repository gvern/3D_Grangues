import * as THREE from 'three';

const aborted = () => new DOMException('Chargement annulé','AbortError');

export function disposeObject(root) {
  const geometries=new Set(), materials=new Set(), textures=new Set(), images=new Set();
  root.traverse(o=>{
    if (o.geometry) geometries.add(o.geometry);
    for (const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]) materials.add(m);
  });
  for (const m of materials) for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
  for (const t of textures) { if(t.source?.data?.close) images.add(t.source.data); t.dispose(); }
  images.forEach(i=>i.close()); geometries.forEach(g=>g.dispose()); materials.forEach(m=>m.dispose());
  root.removeFromParent();
}

export async function fetchBounded(url,{signal,maxBytes,expectedBytes}={}) {
  const response=await fetch(url,{signal,credentials:'same-origin'});
  if (!response.ok) throw new Error(`Relevé inaccessible (HTTP ${response.status}).`);
  const declared=Number(response.headers.get('content-length'));
  if (declared>maxBytes) { await response.body?.cancel(); throw new Error('Fichier trop volumineux pour ce profil.'); }
  const reader=response.body.getReader(), chunks=[];
  let length=0;
  try {
    for(;;) {
      const {done,value}=await reader.read(); if(done)break;
      length+=value.byteLength;
      if(length>maxBytes) { await reader.cancel(); throw new Error('Fichier trop volumineux pour ce profil.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  if(expectedBytes!==undefined && length!==expectedBytes) throw new Error('La taille du fichier diffère du manifeste. Actualiser sa version.');
  const bytes=new Uint8Array(length); let offset=0;
  for(const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.byteLength; }
  return bytes.buffer;
}

// A single GLB is a bounded unit of loading. Separate .gltf resources are not accepted here.
export function validateGLB(buffer) {
  if(buffer.byteLength<20) throw new Error('GLB incomplet.');
  const d=new DataView(buffer);
  if(d.getUint32(0,true)!==0x46546c67 || d.getUint32(4,true)!==2 || d.getUint32(8,true)!==buffer.byteLength || d.getUint32(16,true)!==0x4e4f534a) throw new Error('Fichier GLB 2.0 invalide.');
  const length=d.getUint32(12,true);
  if(20+length>buffer.byteLength) throw new Error('GLB incomplet.');
  const json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,20,length)).trim());
  if ([...(json.buffers||[]),...(json.images||[])].some(v=>v.uri)) throw new Error('Intégrer les images et buffers dans le GLB avant import.');
  return json;
}

function checkPlacement(box) {
  if (box.isEmpty() || [...box.min.toArray(),...box.max.toArray()].some(v=>!Number.isFinite(v)||Math.abs(v)>10000)) throw new Error('Emprise hors du domaine : vérifier les axes, le décalage local et le recalage.');
}

async function decoders(renderer,profile) {
  const lib=await import('../vendor/surveys/loaders.js');
  const draco=new lib.DRACOLoader().setDecoderPath(new URL('../vendor/surveys/draco/',import.meta.url).href).setDecoderConfig({type:'wasm'}).setWorkerLimit(profile.parses);
  const ktx=new lib.KTX2Loader().setTranscoderPath(new URL('../vendor/surveys/basis/',import.meta.url).href).setWorkerLimit(profile.parses).detectSupport(renderer);
  return {lib,draco,ktx,dispose(){draco.dispose();ktx.dispose();}};
}

async function loadGLB(source,variant,profile,signal,scene,renderer) {
  let group,codec;
  try {
    const buffer=await fetchBounded(variant.uri,{signal,maxBytes:profile.maxGLBBytes,expectedBytes:variant.byteSize});
    validateGLB(buffer); if(signal.aborted)throw aborted();
    codec=await decoders(renderer,profile);
    if(signal.aborted)throw aborted();
    const loader=new codec.lib.GLTFLoader().setDRACOLoader(codec.draco).setKTX2Loader(codec.ktx).setMeshoptDecoder(codec.lib.MeshoptDecoder);
    const gltf=await loader.parseAsync(buffer,new URL('.',variant.uri).href);
    group=new THREE.Group(); group.name=source.label; group.add(gltf.scene);
    group.matrixAutoUpdate=false; group.matrix.fromArray(source.sourceToWorld); group.updateMatrixWorld(true);
    if(signal.aborted)throw aborted();
    checkPlacement(new THREE.Box3().setFromObject(group));
    scene.add(group); let disposed=false;
    return {dispose(){if(disposed)return;disposed=true;disposeObject(group);}};
  } catch(error) { if(group)disposeObject(group); throw error; }
  finally { codec?.dispose(); }
}

async function loadTiles(source,variant,profile,signal,scene,camera,renderer) {
  const [{TilesRenderer,GLTFExtensionsPlugin},codec]=await Promise.all([import('../vendor/surveys/tiles.js'),decoders(renderer,profile)]);
  if(signal.aborted){codec.dispose();throw aborted();}
  const tiles=new TilesRenderer(variant.uri), controller=new AbortController();
  try {
  const plugin=new GLTFExtensionsPlugin({dracoLoader:codec.draco,ktxLoader:codec.ktx,meshoptDecoder:codec.lib.MeshoptDecoder,autoDispose:false});
  plugin.autoDispose=false; // Explicit in 0.5.2: constructor doesn't assign this option.
  tiles.registerPlugin(plugin);
  tiles.registerPlugin({name:'abort-survey-fetches',preprocessNode(tile) {
    // 0.5.2 appends '/' when resolving content; URL(origin) already ends in '/'.
    tile.internal.basePath=tile.internal.basePath.replace(/\/$/,'');
  },fetchData(url,options={}) {
    return fetch(url,{...options,credentials:'same-origin',signal:AbortSignal.any([controller.signal,signal,options.signal].filter(Boolean))});
  }});
  tiles.errorTarget=profile.errorTarget;
  tiles.lruCache.maxSize=profile.cacheItems; tiles.lruCache.minSize=Math.floor(profile.cacheItems*.7);
  tiles.lruCache.maxBytesSize=profile.cacheBytes; tiles.lruCache.minBytesSize=Math.floor(profile.cacheBytes*.7);
  tiles.downloadQueue.maxJobsPerOrigin=profile.downloads; tiles.parseQueue.maxJobs=profile.parses;
  tiles.setCamera(camera); tiles.setResolutionFromRenderer(camera,renderer);
  tiles.group.matrixAutoUpdate=false; tiles.group.matrix.fromArray(source.sourceToWorld);
  tiles.group.name=source.label; scene.add(tiles.group);
  let disposed=false, failure=null, resolveReady, rejectReady;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  ready.catch(()=>{}); // May be disposed while the session is still awaiting module creation.
  const timer=setTimeout(()=>rejectReady(new Error('Aucune tuile visible après 45 secondes. Vérifier les fichiers et le point de vue.')),45000);
  const stop=()=>{clearTimeout(timer);rejectReady(aborted());};
  signal.addEventListener('abort',stop,{once:true});
  tiles.addEventListener('load-root-tileset',()=>{
    try {const box=new THREE.Box3();if(tiles.getBoundingBox(box))checkPlacement(box.applyMatrix4(tiles.group.matrix));}
    catch(error){failure=error;rejectReady(error);}
  });
  tiles.addEventListener('load-model',({scene:tileScene})=>{
    tileScene.traverse(o=>{if(o.isPoints){o.material.size=2;o.material.sizeAttenuation=false;}});
    clearTimeout(timer);resolveReady();
  });
  tiles.addEventListener('load-error',()=>{failure=new Error('Une tuile du relevé est inaccessible ou illisible. Vérifier l’hébergement, les autorisations et CORS.');clearTimeout(timer);rejectReady(failure);});
  return {ready,
    update(){if(disposed)return;if(failure)throw failure;camera.updateMatrixWorld();tiles.group.updateMatrixWorld(true);tiles.setResolutionFromRenderer(camera,renderer);tiles.update();},
    stats(){return {cacheBytes:tiles.lruCache.cachedBytes,...tiles.stats};},
    dispose(){if(disposed)return;disposed=true;clearTimeout(timer);signal.removeEventListener('abort',stop);controller.abort();tiles.dispose();tiles.group.removeFromParent();codec.dispose();rejectReady(aborted());},
  };
  } catch(error) { controller.abort();tiles.dispose();codec.dispose();throw error; }
}

export function createSurveyLoader({scene,camera,renderer}) {
  return (source,variant,profile,signal)=>source.format==='3d-tiles'
    ? loadTiles(source,variant,profile,signal,scene,camera,renderer)
    : loadGLB(source,variant,profile,signal,scene,renderer);
}
