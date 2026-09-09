// Explicit local metric frame: never infer a scan CRS from its provider or extension.
export const SITE_ID = 'domaine-grangues-3d';
export const FRAME = Object.freeze({
  horizontalCRS: 'EPSG:2154',
  origin: Object.freeze([477616.19, 6910397.86, 112.79]),
  axes: 'x-east-y-up-z-south',
  verticalDatum: 'unverified-IGN-model-reference',
});
export const IDENTITY = Object.freeze([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
export const PROFILES = Object.freeze({
  mobile: Object.freeze({label:'Économe', errorTarget:12, cacheBytes:128*1024**2, cacheItems:256, downloads:2, parses:1, maxGLBBytes:32*1024**2, pixelRatio:1}),
  desktop: Object.freeze({label:'Détaillé', errorTarget:6, cacheBytes:256*1024**2, cacheItems:512, downloads:4, parses:2, maxGLBBytes:96*1024**2, pixelRatio:1.6}),
});
const replacements = ['castle','terrain','trees','outbuildings','ancillary','pond'];
const fail = message => { throw new Error(message); };
const vector = (v, label) => {
  if (!Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite)) fail(`${label} : trois coordonnées finies sont requises.`);
};

export function lambertToWorld([e,n,h], origin=FRAME.origin) {
  return [e-origin[0], h-origin[2], origin[1]-n];
}
export function worldToLambert([x,y,z], origin=FRAME.origin) {
  return [x+origin[0], origin[1]-z, y+origin[2]];
}
export function transformPoint(m,[x,y,z]) {
  return [m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]];
}

export function validateTransform(m) {
  if (!Array.isArray(m) || m.length !== 16 || !m.every(Number.isFinite)) fail('sourceToWorld : matrice de 16 nombres requise, rangée par colonnes.');
  if ([m[3],m[7],m[11]].some(x=>Math.abs(x)>1e-9) || Math.abs(m[15]-1)>1e-9) fail('La matrice doit être affine.');
  const axes = [[m[0],m[1],m[2]], [m[4],m[5],m[6]], [m[8],m[9],m[10]]];
  const lengths = axes.map(a=>Math.hypot(...a));
  const s = lengths[0];
  const dot = (a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
  if (s<0.001 || s>1000 || lengths.some(v=>Math.abs(v-s)>s*1e-5) || [dot(axes[0],axes[1]),dot(axes[0],axes[2]),dot(axes[1],axes[2])].some(v=>Math.abs(v)>s*s*1e-5)) fail('Utiliser une rotation et une échelle uniforme, sans déformation.');
  const determinant = m[0]*(m[5]*m[10]-m[9]*m[6])-m[4]*(m[1]*m[10]-m[9]*m[2])+m[8]*(m[1]*m[6]-m[5]*m[2]);
  if (determinant<=0) fail('La matrice inverse le repère : corriger les axes avant import.');
  if (Math.max(...m.slice(12,15).map(Math.abs))>10000) fail('Coordonnées trop grandes : décaler le relevé dans un repère local avant import.');
  return m;
}

export function assetURL(uri,baseURL) {
  if (typeof uri!=='string' || !uri || uri.length>4096) fail('Adresse de relevé invalide.');
  const url = new URL(uri,baseURL);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password) fail('Les relevés doivent utiliser une adresse HTTP(S), sans identifiants intégrés.');
  if (new URL(baseURL).protocol==='https:' && url.protocol!=='https:') fail('Une page HTTPS nécessite des relevés HTTPS.');
  return url.href;
}

export function validateManifest(input,baseURL) {
  const m = structuredClone(input);
  if (m?.schemaVersion!==1 || m.siteId!==SITE_ID) fail('Ce manifeste ne correspond pas au domaine de Grangues.');
  if (m.referenceFrame?.horizontalCRS!==FRAME.horizontalCRS || m.referenceFrame.axes!==FRAME.axes || !Array.isArray(m.referenceFrame.origin) || m.referenceFrame.origin.length!==3 || m.referenceFrame.origin.some((v,i)=>!Number.isFinite(v)||Math.abs(v-FRAME.origin[i])>0.001)) fail('Repère incompatible avec la maquette : contrôler projection, axes et origine.');
  if (!Array.isArray(m.sources) || m.sources.length>50) fail('Liste de relevés invalide (50 maximum).');
  const ids = new Set();
  for (const s of m.sources) {
    if (!s || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(s.id) || ids.has(s.id)) fail('Chaque relevé doit avoir un identifiant unique.');
    ids.add(s.id);
    if (typeof s.label!=='string' || !s.label || s.label.length>120) fail('Libellé de relevé invalide.');
    if (!['exterior','interior'].includes(s.role) || !['pending','ready'].includes(s.availability) || !['3d-tiles','glb'].includes(s.format)) fail(`Format ou statut non pris en charge : ${s.id}.`);
    if (s.availability==='pending') {
      if (s.variants?.length) fail(`Un relevé en attente ne doit pas annoncer de fichiers disponibles : ${s.id}.`);
      continue;
    }
    if (s.coordinateSpace!=='local-meters') fail(`${s.id} : convertir et décaler les données en mètres locaux avant import.`);
    validateTransform(s.sourceToWorld);
    if (!['checked','unverified'].includes(s.registration?.status)) fail(`${s.id} : renseigner le statut du recalage.`);
    if (!Array.isArray(s.replaces) || s.replaces.some(v=>!replacements.includes(v))) fail(`${s.id} : couches remplacées invalides.`);
    vector(s.entry?.position,'Caméra'); vector(s.entry?.target,'Cible');
    if ([...s.entry.position,...s.entry.target].some(v=>Math.abs(v)>10000) || Math.hypot(...s.entry.position.map((v,i)=>v-s.entry.target[i]))<0.05) fail(`${s.id} : point de vue invalide dans le repère local.`);
    if (s.role==='interior' && (typeof s.floorId!=='string' || !s.floorId || s.floorId.length>60)) fail(`${s.id} : étage requis.`);
    if (!Array.isArray(s.variants) || !s.variants.length || s.variants.length>2) fail(`${s.id} : fournir une ou deux variantes web.`);
    const qualities = new Set();
    for (const v of s.variants) {
      if (!PROFILES[v.quality] || qualities.has(v.quality)) fail(`${s.id} : qualité inconnue ou dupliquée.`);
      qualities.add(v.quality);
      v.uri = assetURL(v.uri,baseURL);
      if (s.format==='glb' && (!Number.isSafeInteger(v.byteSize) || v.byteSize<=0 || v.byteSize>PROFILES[v.quality].maxGLBBytes)) fail(`${s.id} : GLB trop lourd pour ce profil ; découper le relevé ou fournir un LOD plus léger.`);
    }
  }
  return m;
}

export function variantFor(source,quality) {
  // Never silently substitute a heavy desktop mesh on a mobile profile.
  return source.variants?.find(v=>v.quality===quality) || (quality==='desktop' ? source.variants?.find(v=>v.quality==='mobile') : null);
}
