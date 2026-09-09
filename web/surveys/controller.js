import * as THREE from 'three';
import { FRAME, validateManifest, PROFILES, variantFor } from './manifest.js';
import { SurveySession } from './session.js';
import { createSurveyLoader } from './loaders.js';

export async function mountSurveys({scene,camera,orbit,renderer,model,cancelAnimation,toast}) {
  if(model.root.userData.crs!==FRAME.horizontalCRS || model.root.userData.origin.some((v,i)=>Math.abs(v-FRAME.origin[i])>.001) || Math.abs(model.datum-FRAME.origin[2])>.001) throw new Error('Le repère de la maquette a changé : mettre à jour les alignements des relevés.');
  const $=id=>document.getElementById(id);
  const layers={castle:model.castle,terrain:model.terrain,trees:model.trees,outbuildings:model.outbuildings,ancillary:model.ancillary,pond:model.pondGroup};
  const savedVisibility=new Map(), bookmarks=new Map();
  let modelView=null, activeId=null;
  const view=()=>({position:camera.position.toArray(),target:orbit.target.toArray()});
  const restoreLayers=()=>{savedVisibility.forEach((visible,obj)=>{obj.visible=visible;});savedVisibility.clear();};
  function move(v,indoor) {
    cancelAnimation();
    camera.near=indoor?.025:.25; camera.far=indoor?1500:6000; camera.updateProjectionMatrix();
    orbit.minDistance=indoor?.05:6; orbit.maxDistance=indoor?120:2100;
    orbit.maxPolarAngle=indoor?Math.PI*.99:Math.PI*.482; orbit.screenSpacePanning=indoor;
    camera.position.fromArray(v.position);orbit.target.fromArray(v.target);orbit.update();
  }
  const session=new SurveySession({load:createSurveyLoader({scene,camera,renderer}),onChange(state) {
    restoreLayers();
    $('survey-model').classList.toggle('active',state.status==='model'||state.status==='error');
    if(state.status==='loading') {
      move(bookmarks.get(state.source.id)||state.source.entry,state.source.role==='interior');
      $('survey-status').textContent=`Chargement · ${state.source.label}`;
    } else if(state.status==='ready') {
      for(const key of state.source.replaces) {const obj=layers[key];savedVisibility.set(obj,obj.visible);obj.visible=false;}
      $('survey-status').textContent=state.source.label+(state.source.registration.status==='checked'?' · recalage contrôlé':' · recalage à contrôler');
      $('scene-tag').textContent=state.source.label;
    } else {
      if(modelView)move(modelView,false);
      activeId=null;
      $('survey-status').textContent=state.status==='error'?`Retour à la maquette : ${state.error}`:'Maquette de travail · relevés séparés';
      $('scene-tag').textContent='MAQUETTE DU DOMAINE';
      if(state.status==='error')toast(state.error);
    }
    drawSources();
  }});
  session.profile=(navigator.deviceMemory && navigator.deviceMemory>=8 && innerWidth>900)?'desktop':'mobile';
  $('survey-quality').value=session.profile;
  function saveView() {
    if(activeId)bookmarks.set(activeId,view());else modelView=view();
  }
  function drawSources() {
    $('survey-sources').replaceChildren();
    for(const source of session.manifest?.sources||[]) {
      const b=document.createElement('button');b.className='secondary wide';
      b.textContent=source.label+(source.availability==='pending'?' · en attente':'');
      b.disabled=source.availability!=='ready'||!variantFor(source,session.profile);
      b.classList.toggle('active',session.state.source?.id===source.id&&session.state.status!=='error');
      if(source.availability==='ready'&&b.disabled)b.title='Une variante économe est nécessaire pour cet appareil.';
      b.addEventListener('click',async()=>{
        saveView();activeId=source.id;
        renderer.setPixelRatio(Math.min(devicePixelRatio,PROFILES[session.profile].pixelRatio));
        try{await session.select(source.id);}catch(error){toast(error.message);}
      });
      $('survey-sources').append(b);
    }
  }
  function toModel() {
    if(session.state.status==='model')return;
    saveView();session.toModel();
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  }
  $('survey-model').addEventListener('click',toModel);
  $('survey-quality').addEventListener('change',async e=>{
    saveView();
    try{await session.setProfile(e.target.value);renderer.setPixelRatio(Math.min(devicePixelRatio,PROFILES[session.profile].pixelRatio));drawSources();}
    catch(error){e.target.value=session.profile;toast(error.message);}
  });
  $('survey-import').addEventListener('click',()=>$('survey-file').click());
  $('survey-file').addEventListener('change',async e=>{
    try{
      const file=e.target.files[0];if(!file)return;if(file.size>256*1024)throw new Error('Manifeste trop volumineux.');
      const manifest=validateManifest(JSON.parse(await file.text()),document.baseURI);
      toModel();bookmarks.clear();session.setManifest(manifest);
      toast('Configuration chargée pour cette session.');
    }catch(error){toast(error.message);}finally{e.target.value='';}
  });
  try {
    const response=await fetch('./assets/surveys.json');
    if(!response.ok)throw new Error('Configuration des relevés indisponible.');
    session.setManifest(validateManifest(await response.json(),response.url));
  } catch(error) { $('survey-status').textContent=error.message; }
  return {toModel,update:()=>session.update(),dispose:()=>{restoreLayers();session.dispose();},
    setLayerVisible(key,visible){const obj=layers[key];if(savedVisibility.has(obj))savedVisibility.set(obj,visible);else obj.visible=visible;},
    get interior(){return ['loading','ready'].includes(session.state.status)&&session.state.source?.role==='interior';}};
}
