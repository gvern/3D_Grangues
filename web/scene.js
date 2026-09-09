import * as THREE from 'three';
import { mergeGeometries } from './vendor/BufferGeometryUtils.js';

// Metres, east = +X, north = -Z. Architectural details are inferred from photos.
export function insideRing(x,z,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a[1]>z)!==(b[1]>z))&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export function insidePolygons(x,z,polys){return polys.some(rings=>insideRing(x,z,rings[0])&&!rings.slice(1).some(r=>insideRing(x,z,r)));}
function random(seed=7613){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
const rng=random();
const palette={stone:0xc3b793,trim:0xded4b6,base:0x827765,roof:0x666c72,metal:0x323b3b,glass:0x29454a,shutter:0xd8ded5,brick:0x9d7057,stucco:0xd8d1b7,paving:0xafa996,gardenPavers:0xb4aaa0,gravel:0xbcb5a3,soil:0x393b28,hedge:0x345c26,bark:0x635544};
const unitBox=new THREE.BoxGeometry(1,1,1);
function mesh(parent,geometry,material,name){const o=new THREE.Mesh(geometry,material);o.name=name||'';o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
function block(parent,mat,x,y,z,w,h,d,name){const o=mesh(parent,unitBox,mat,name);o.position.set(x,y,z);o.scale.set(w,h,d);return o;}
function column(parent,mat,x,y,z,r,h,top=r){const o=mesh(parent,new THREE.CylinderGeometry(top,r,h,8),mat);o.position.set(x,y,z);return o;}
function surface(parent,mat,points){const g=new THREE.BufferGeometry(),v=[],uv=[];for(const p of points)v.push(...p);for(const p of points)uv.push(p[0]*.4,p[2]*.4+p[1]*.55);g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(points.length===4?[0,1,2,0,2,3]:[0,1,2]);g.computeVertexNormals();return mesh(parent,g,mat);}
function frustumRoof(parent,mat,w,d,y,tw,td,ty){const a=[[-w/2,y,-d/2],[w/2,y,-d/2],[w/2,y,d/2],[-w/2,y,d/2]],b=[[-tw/2,ty,-td/2],[tw/2,ty,-td/2],[tw/2,ty,td/2],[-tw/2,ty,td/2]];for(let i=0;i<4;i++)surface(parent,mat,[a[i],b[i],b[(i+1)%4],a[(i+1)%4]]);}
function hipRoof(parent,mat,w,d,y,rise){if(d>w){const rotated=new THREE.Group();rotated.rotation.y=Math.PI/2;parent.add(rotated);hipRoof(rotated,mat,d,w,y,rise);return;}const h=Math.min(d*.45,w*.22),a=[-w/2+h,y+rise,0],b=[w/2-h,y+rise,0];surface(parent,mat,[[-w/2,y,-d/2],a,b,[w/2,y,-d/2]]);surface(parent,mat,[[-w/2,y,d/2],[w/2,y,d/2],b,a]);surface(parent,mat,[[-w/2,y,-d/2],[-w/2,y,d/2],a]);surface(parent,mat,[[w/2,y,d/2],[w/2,y,-d/2],b]);}
function archBand(parent,mat,x,y,z,width,rise,depth=.23,thickness=.18){const r=width/2,s=new THREE.Shape();s.absellipse(0,0,r,rise,0,Math.PI,false,0);s.lineTo(-(r-thickness),0);s.absellipse(0,0,r-thickness,Math.max(.04,rise-thickness),Math.PI,0,true,0);s.closePath();const g=new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:false,curveSegments:16});const o=mesh(parent,g,mat);o.position.set(x,y,z-depth/2);return o;}
function rail(parent,mat,x,y,z,w,orient=0,h=.72){const group=new THREE.Group();group.position.set(x,y,z);group.rotation.y=orient;parent.add(group);block(group,mat,0,h,0,w,.065,.07);block(group,mat,0,.08,0,w,.05,.06);const count=Math.ceil(w/.23);for(let i=0;i<=count;i++)block(group,mat,-w/2+w*i/count,h/2,0,.035,h,.035);return group;}
function greekRail(parent,mat,x,y,z,w,h){const g=new THREE.Group();g.position.set(x,y,z);parent.add(g);for(const yy of [0,h])block(g,mat,0,yy,0,w,.045,.055);const count=Math.max(1,Math.round(w/.85)),cw=w/count;for(let i=0;i<count;i++){const left=-w/2+i*cw;block(g,mat,left,h/2,0,.035,h,.045);const pts=[[.08,.15],[.08,.85],[.9,.85],[.9,.15],[.28,.15],[.28,.65],[.69,.65],[.69,.36],[.48,.36]];for(let j=0;j<pts.length-1;j++){const a=pts[j],b=pts[j+1];block(g,mat,left+(a[0]+b[0])*cw/2,(a[1]+b[1])*h/2,0,Math.max(.035,Math.abs(a[0]-b[0])*cw),Math.max(.035,Math.abs(a[1]-b[1])*h),.045);}}return g;}
function baluster(parent,mat,x,y,z,h=.66){const profile=[[.10,0],[.12,.04],[.12,.1],[.07,.14],[.07,.2],[.13,.29],[.135,.37],[.115,.44],[.075,.52],[.046,.66],[.075,.76],[.1,.8],[.08,.87],[.08,.94],[.11,1]].map(([r,t])=>new THREE.Vector2(r*h/.66,t*h-h/2));const o=mesh(parent,new THREE.LatheGeometry(profile,10),mat);o.position.set(x,y,z);block(parent,mat,x,y-h/2,z,.24,.055,.24);block(parent,mat,x,y+h/2,z,.24,.055,.24);return o;}
function ironGuard(parent,mat,x,y,z,w,angle=0){const g=rail(parent,mat,x,y,z,w,angle,1.04);for(let i=0;i<=Math.floor(w/.25);i++){const xx=-w/2+i*.25;const tip=mesh(g,new THREE.ConeGeometry(.07,.17,4),mat);tip.position.set(xx,1.16,0);if(i%2===0){const circle=mesh(g,new THREE.TorusGeometry(.11,.012,4,14),mat);circle.position.set(xx,.55,0);}}return g;}
function hedgeBlock(parent,mat,x,y,z,w,h,d,r=Math.min(w,h,d)*.18){const g=new THREE.BoxGeometry(w,h,d,8,5,8),p=g.attributes.position,c=new THREE.Vector3(),v=new THREE.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);c.set(THREE.MathUtils.clamp(v.x,-w/2+r,w/2-r),THREE.MathUtils.clamp(v.y,-h/2+r,h/2-r),THREE.MathUtils.clamp(v.z,-d/2+r,d/2-r));v.sub(c).normalize().multiplyScalar(r).add(c);p.setXYZ(i,v.x,v.y,v.z);}g.computeVertexNormals();const o=mesh(parent,g,mat);o.position.set(x,y,z);return o;}
function topiary(parent,mat,x,z,r,h,form='dome',base=.04){const profiles={dome:[[0,0],[.86,0],[.98,.12],[1,.28],[.95,.55],[.77,.79],[.48,.94],[0,1]],cone:[[0,0],[.89,0],[1,.09],[.95,.22],[.70,.48],[.37,.74],[.14,.94],[0,1]],column:[[0,0],[.92,0],[1,.1],[.99,.35],[.89,.67],[.73,.88],[.52,.97],[0,1]]};const points=profiles[form].map(([radius,y])=>new THREE.Vector2(radius*r,y*h)),g=new THREE.LatheGeometry(points,28),p=g.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i),angle=Math.atan2(p.getZ(i),p.getX(i)),f=1+.012*Math.sin(angle*7+y*14)+.008*Math.sin(angle*13-y*8);p.setX(i,p.getX(i)*f);p.setZ(i,p.getZ(i)*f);}g.computeVertexNormals();const o=mesh(parent,g,mat);o.position.set(x,base,z);return o;}
function windowDetail(parent,m,x,y,z,{w=1.5,h=2.65,shutters=true,closed=false,arched=false,balcony=false}={}){
  const g=new THREE.Group();parent.add(g);g.position.set(x,y,z);
  block(g,m.recess,0,0,-.01,w+.23,h+.18,.12);
  block(g,m.glass,0,0,.055,w-.08,h-.08,.055);
  for(const px of [-w/2-.12,w/2+.12])block(g,m.trim,px,.03,.05,.2,h+.32,.22);
  block(g,m.trim,0,h/2+.14,.06,w+.48,.22,.28);block(g,m.trim,0,-h/2-.1,.16,w+.46,.18,.46);
  for(const px of [-w/2,0,w/2])block(g,m.shutter,px,0,.14,.055,h,.07);
  for(const py of [-h/2,-h/6,h/6,h/2])block(g,m.shutter,0,py,.14,w,.05,.07);
  if(arched)archBand(g,m.trim,0,h/2+.15,.1,w+.45,.5,.35,.24);
  if(shutters){for(const side of [-1,1]){const sx=closed?side*w/4:side*(w*.76+.18),sw=w/2-.025;block(g,m.shutter,sx,0,.23,sw,h+.04,.10);for(let i=0;i<20;i++)block(g,m.shutterShade,sx,-h/2+.1+i*(h-.2)/19,.291,sw-.06,.017,.013);block(g,m.shutter,sx,0,.304,.065,h,.025);}}
  if(balcony)rail(g,m.metal,0,-h/2+.1,.4,w+.23,0,.68);
  return g;
}
function compact(group){group.updateMatrixWorld(true);const buckets=new Map();group.traverse(o=>{if(!o.isMesh||!o.geometry?.attributes.position)return;const k=o.material.uuid;if(!buckets.has(k))buckets.set(k,{material:o.material,geometries:[]});const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();const inv=new THREE.Matrix4().copy(group.matrixWorld).invert();geo.applyMatrix4(inv.multiply(o.matrixWorld));for(const attr of Object.keys(geo.attributes))if(!['position','normal','uv'].includes(attr))geo.deleteAttribute(attr);if(!geo.attributes.uv)geo.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count*2),2));buckets.get(k).geometries.push(geo);});group.clear();for(const v of buckets.values()){const merged=mergeGeometries(v.geometries,false);if(!merged)throw new Error('Fusion de géométrie impossible');const result=mesh(group,merged,v.material);result.name=group.name+' · '+v.material.name;v.geometries.forEach(g=>g.dispose());}}

export function buildDomain(data,textures={}){
 const root=new THREE.Group();root.name='Domaine de Grangues — maquette de travail';root.userData={crs:data.crs,origin:data.origin,address:data.address,disclaimer:'Architecture détaillée reconstituée à partir de photographies ; dimensions et parties cachées à contrôler.'};
 const m={};for(const [key,color] of Object.entries(palette)){m[key]=new THREE.MeshStandardMaterial({color,roughness:key==='glass'?.21:.87,metalness:key==='metal'?.65:key==='glass'?.16:0});m[key].name=key;}
 m.roof.side=THREE.DoubleSide;m.roof.map=textures.roof||null;m.roof.bumpMap=textures.roofBump||null;m.roof.bumpScale=.045;
 m.stone.map=textures.stone||null;m.trim.map=textures.stone||null;
 m.hedge.map=textures.hedge||null;m.hedge.bumpMap=textures.hedge||null;m.hedge.bumpScale=.035;
 m.gravel.map=textures.gravel||null;m.gravel.bumpMap=textures.gravel||null;m.gravel.bumpScale=.025;
 m.gardenPavers.map=textures.pavers||null;m.gardenPavers.bumpMap=textures.pavers||null;m.gardenPavers.bumpScale=.015;
 m.recess=new THREE.MeshStandardMaterial({color:0x303935,roughness:.95});m.recess.name='Embrasures';m.shutterShade=new THREE.MeshStandardMaterial({color:0xb3bfb4,roughness:.9});m.shutterShade.name='Lames de volets';
 const castleData=data.buildings.find(b=>b.id==='building-636');if(!castleData)throw new Error('Emprise du château absente');
 const datum=castleData.altitude,grid=data.terrain,bounds=data.bounds;
 function rawHeight(x,z){const gx=(x-bounds[0])/grid.step,gz=(z-bounds[1])/grid.step,ix=THREE.MathUtils.clamp(Math.floor(gx),0,grid.nx-2),iz=THREE.MathUtils.clamp(Math.floor(gz),0,grid.nz-2),u=THREE.MathUtils.clamp(gx-ix,0,1),v=THREE.MathUtils.clamp(gz-iz,0,1),a=iz*grid.nx+ix;return ((1-v)*((1-u)*grid.altitudes[a]+u*grid.altitudes[a+1])+v*((1-u)*grid.altitudes[a+grid.nx]+u*grid.altitudes[a+grid.nx+1]))-datum;}
 const height=rawHeight;
 const pos=[],uv=[],idx=[];for(let j=0;j<grid.nz;j++)for(let i=0;i<grid.nx;i++){pos.push(bounds[0]+i*grid.step,grid.altitudes[j*grid.nx+i]-datum,bounds[1]+j*grid.step);uv.push(i/(grid.nx-1),1-j/(grid.nz-1));if(i<grid.nx-1&&j<grid.nz-1){const a=j*grid.nx+i,b=a+1,c=a+grid.nx,d=c+1;idx.push(a,c,b,b,c,d);}}
 // Refine only the interpolation near the castle to leave actual openings for the lightwells.
 // Their 2 m depth is an estimate from the close-up photographs, not a surveyed level.
 const patchX=bounds[0]+Math.floor((castleData.center[0]-bounds[0]-35)/10)*10,patchZ=bounds[1]+Math.floor((castleData.center[1]-bounds[1]-35)/10)*10;
 const retained=[];for(let k=0;k<idx.length;k+=3){let x=0,z=0;for(let j=0;j<3;j++){x+=pos[idx[k+j]*3]/3;z+=pos[idx[k+j]*3+2]/3;}if(!(x>patchX&&x<patchX+80&&z>patchZ&&z<patchZ+80))retained.push(idx[k],idx[k+1],idx[k+2]);}idx.length=0;idx.push(...retained);
 const startIndex=pos.length/3,nn=161,cc=Math.cos(castleData.angle),ss=Math.sin(castleData.angle);
 // Castle-local +X points south and +Z points west. The owner confirmed this mapping.
 function inCastleVoid(x,z){const dx=x-castleData.center[0],dz=z-castleData.center[1],lx=cc*dx+ss*dz,lz=-ss*dx+cc*dz;const northCourt=lx<-15.58&&lx>-21.0&&Math.abs(lz)<7.6;const westBasement=Math.abs(lx)>2.5&&Math.abs(lx)<15.55&&lz>6.62&&lz<9.46;return northCourt||westBasement;}
 for(let j=0;j<nn;j++)for(let i=0;i<nn;i++){const x=patchX+i*.5,z=patchZ+j*.5;pos.push(x,height(x,z),z);uv.push((x-bounds[0])/(bounds[2]-bounds[0]),1-(z-bounds[1])/(bounds[3]-bounds[1]));if(i<nn-1&&j<nn-1){const a=startIndex+j*nn+i,b=a+1,c=a+nn,d=c+1;if(!inCastleVoid(x+.5/3,z+.5/3))idx.push(a,c,b);if(!inCastleVoid(x+1/3,z+1/3))idx.push(b,c,d);}}
 const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));tg.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));tg.setIndex(idx);tg.computeVertexNormals();
 const terrainMaterial=new THREE.MeshStandardMaterial({map:textures.ortho||null,color:textures.ortho?0xffffff:0x81935b,roughness:1,metalness:0});terrainMaterial.name='IGN orthophotographie';const terrain=mesh(root,tg,terrainMaterial,'Terrain RGE ALTI — maille 10 m');terrain.castShadow=false;
 const parcelGroup=new THREE.Group();parcelGroup.name='19 parcelles du propriétaire';root.add(parcelGroup);const parcelLines=new Map();
 for(const p of data.parcels){const pg=new THREE.Group();pg.name='Parcelle '+p.code;pg.userData={code:p.code,area:p.area,source:'Cadastre Etalab, juin 2026'};for(const polygon of p.polygons)for(const ring of polygon){const pts=[];for(let i=0;i<ring.length-1;i++){const a=ring[i],b=ring[i+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4));for(let j=0;j<n;j++){const x=THREE.MathUtils.lerp(a[0],b[0],j/n),z=THREE.MathUtils.lerp(a[1],b[1],j/n);pts.push(new THREE.Vector3(x,height(x,z)+.42,z));}}const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),new THREE.LineBasicMaterial({color:0x9cd8e0,transparent:true,opacity:.85,depthTest:false}));line.renderOrder=3;pg.add(line);}parcelGroup.add(pg);parcelLines.set(p.code,pg);}
 let selection=null;
 function selectParcel(code){if(selection){root.remove(selection);selection.geometry.dispose();selection.material.dispose();selection=null;}parcelLines.forEach((g,k)=>g.children.forEach(l=>{l.material.color.set(k===code?0xffd37f:0x9cd8e0);l.material.opacity=code?(k===code?1:.38):.85;}));if(!code)return;const p=data.parcels.find(p=>p.code===code);if(!p)return;const indices=[];for(let i=0;i<idx.length;i+=3){const ids=idx.slice(i,i+3);let x=0,z=0;ids.forEach(k=>{x+=pos[k*3]/3;z+=pos[k*3+2]/3;});if(insidePolygons(x,z,p.polygons))indices.push(...ids);}const g=tg.clone();g.setIndex(indices);g.translate(0,.2,0);selection=mesh(root,g,new THREE.MeshBasicMaterial({color:0xefd398,transparent:true,opacity:.23,depthWrite:false,side:THREE.DoubleSide}),'Parcelle sélectionnée');selection.castShadow=false;}

 // Owner-confirmed sides: east perron (7 bays), west box garden (5 bays),
 // north English courtyard, south balustraded terrace (3 lateral bays).
 const castle=new THREE.Group();castle.name='Château — détails interprétés des photos';castle.position.set(...[castleData.center[0],0,castleData.center[1]]);castle.rotation.y=-castleData.angle;root.add(castle);
 const W=31.2,D=13.3,E=11.8;
 block(castle,m.base,0,-.225,0,W,3.55,D);
 block(castle,m.stone,0,6.5,0,W,10.5,D);
 for(const [y,w,h,d] of [[1.55,W+.15,.22,D+.15],[6.1,W+.28,.22,D+.28],[11.2,W+.25,.35,D+.25],[11.65,W+.7,.25,D+.7],[11.9,W+1.0,.18,D+1]])block(castle,m.trim,0,y,0,w,h,d);
 // Corner quoins and pilasters.
 for(const x of [-W/2+.24,W/2-.24])for(const z of [-D/2-.02,D/2+.02])for(let j=0;j<17;j++)block(castle,m.trim,x,1.9+j*.54,z,j%2?.85:.56,.5,.28);
 for(const face of [1,-1]){
  const front=new THREE.Group();castle.add(front);front.rotation.y=face===1?0:Math.PI;front.position.z=face*(D/2+.02);const bays=face===-1?7:5,span=W-5.2;
  for(let i=0;i<bays;i++){const x=-span/2+i*span/(bays-1);windowDetail(front,m,x,8.64,0,{w:1.53,h:2.66,closed:false,balcony:true});
   if(i===Math.floor(bays/2)){
    block(front,m.recess,x,3.45,.05,1.87,3.72,.18);block(front,m.metal,x,3.4,.16,1.67,3.54,.12);
    for(const dx of [-1.1,1.1])block(front,m.trim,x+dx,3.55,.24,.31,3.9,.5);
    block(front,m.trim,x,5.55,.23,2.65,.28,.57);archBand(front,m.trim,x,5.68,.3,2.9,.65,.5,.28);
    for(const dx of [-.44,.44])block(front,m.base,x+dx,3.0,.24,.63,1.6,.055);
    for(const dx of [-.43,.43])block(front,m.glass,x+dx,4.65,.25,.55,.85,.055);
    block(front,m.trim,x,5.75,.44,.27,.39,.23);
   }else windowDetail(front,m,x,3.8,0,{w:1.58,h:3.12,closed:true,balcony:false});
   if(face===-1&&i!==3){block(front,m.recess,x,.62,.08,1.1,.64,.16);rail(front,m.metal,x,.36,.2,1,0,.48);}
   const dy=13.47+(face===1&&i===2?.12:0),dw=face===1&&i===2?2.05:1.65;
   const dormer=new THREE.Group();front.add(dormer);dormer.position.set(x,dy,-.46);block(dormer,m.trim,0,0,-.55,dw+1,2.8,1.4);windowDetail(dormer,m,0,0,.2,{w:dw,h:2.38,shutters:false,arched:true});
   block(dormer,m.trim,0,-1.4,.05,dw+1.0,.2,1.75);archBand(dormer,m.trim,0,1.42,.09,dw+1.2,.65,.8,.25);block(dormer,m.trim,0,1.36,0,dw+1.23,.12,1.2);
  }
  for(const x of [-W/2+.1,0,W/2-.1])block(front,m.trim,x,6.52,.0,.28,10.2,.21);
 }
 for(const side of [-1,1]){const f=new THREE.Group();castle.add(f);f.position.x=side*W/2;f.rotation.y=side*Math.PI/2;for(const x of (side===1?[-4.1,0,4.1]:[-3.5,3.5]))for(const y of [3.8,8.64])windowDetail(f,m,x,y,0,{w:1.35,h:y<5?2.9:2.66,shutters:true});windowDetail(f,m,0,13.55,-.68,{w:1.4,h:2.5,shutters:false,arched:true});}
 frustumRoof(castle,m.roof,W+1.05,D+1.05,11.96,W-.7,D-2.0,15.3);hipRoof(castle,m.roof,W-.7,D-2,15.3,4.1);
 block(castle,m.metal,0,19.39,0,W-D*.42,.10,.13);
 for(const x of [-14.15,14.15])for(const z of [-3.95,3.95]){const y=17.7;block(castle,m.trim,x,y,z,1.05,5.8,1.0);for(let j=0;j<7;j++)block(castle,m.base,x,15.2+j*.76,z,1.1,.08,1.07);block(castle,m.trim,x,20.62,z,1.48,.28,1.42);block(castle,m.base,x,20.92,z,1.2,.21,1.17);for(const dx of [-.27,.27])column(castle,m.brick,x+dx,21.29,z,.15,.61,.13);}
 for(const x of [-4.9,5.1]){block(castle,m.brick,x,19.2,-.8,.65,2.8,.72);block(castle,m.trim,x,20.55,-.8,.86,.18,.91);column(castle,m.brick,x,20.93,-.8,.18,.59);}
 for(const x of [-W/2+1.8,W/2-1.8]){column(castle,m.trim,x,19.1,0,.08,.9);const ornament=mesh(castle,new THREE.SphereGeometry(.15,8,6),m.trim);ornament.position.set(x,19.6,0);}
 compact(castle);
 // Keep the four owner-identified areas as separately named groups in the GLB.
 const features={};
 function feature(key,name,cardinal,rotation=0,x=0,z=0){const g=new THREE.Group();g.name=name;g.userData={cardinal,orientationSource:'Confirmation du propriétaire',dimensions:'Estimées à partir des photographies'};g.rotation.y=rotation;g.position.set(x,0,z);castle.add(g);features[key]=g;return g;}
 function stoneGuard(parent,x,y,z,w,angle=0){const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=angle;parent.add(g);block(g,m.trim,0,.88,0,w,.2,.32);const n=Math.ceil(w/.45);for(let i=0;i<=n;i++)baluster(g,m.trim,-w/2+w*i/n,.48,0);return g;}
 function groundPlane(parent,mat,x0,x1,z0,z1,accept=()=>true){const nx=Math.ceil(x1-x0),nz=Math.ceil(z1-z0),v=[],u=[],indices=[];for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=x0+(x1-x0)*i/nx,z=z0+(z1-z0)*j/nz;v.push(x,.015,z);u.push(x*.4,-z*.4);if(i<nx&&j<nz&&accept(x+(x1-x0)/nx/2,z+(z1-z0)/nz/2)){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;indices.push(a,c,b,b,c,d);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(u,2));g.setIndex(indices);g.computeVertexNormals();return mesh(parent,g,mat);}
 function drapeGround(group){group.updateMatrixWorld(true);const q=new THREE.Vector3();group.traverse(o=>{if(!o.isMesh)return;const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){q.set(p.getX(i),0,p.getZ(i)).applyMatrix4(group.matrixWorld);p.setY(i,p.getY(i)+height(q.x,q.z)+.075);}p.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();});}

 // South terrace: upper walkway, two lateral flights and a lower central landing.
 const terrace=feature('terrace','SUD · Terrasse à balustrade','S',Math.PI/2,W/2);
 block(terrace,m.base,0,.65,.8,15.8,1.6,1.6);block(terrace,m.paving,0,1.49,.8,15.8,.14,1.6);
 for(const s of [-1,1]){block(terrace,m.base,s*6.65,.65,3.05,2.5,1.6,2.9);block(terrace,m.paving,s*6.65,1.49,3.05,2.5,.14,2.9);stoneGuard(terrace,s*6.65,1.48,4.5,2.5);stoneGuard(terrace,s*7.9,1.48,2.25,4.5,Math.PI/2);stoneGuard(terrace,s*3.15,1.48,1.6,6.3);
  for(let i=0;i<7;i++){const x=s*(5.32-i*.4),h=1.46-i*.135;block(terrace,m.trim,x,h/2,3.1,.44,h,2.3);baluster(terrace,m.trim,x,h+.42,4.38);}
  const a=new THREE.Vector3(s*5.55,2.36,4.4),b=new THREE.Vector3(s*2.85,1.47,4.4),bar=block(terrace,m.trim,0,0,0,.18,.2,a.distanceTo(b));bar.position.copy(a.clone().add(b).multiplyScalar(.5));bar.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),b.sub(a).normalize());
 }
 block(terrace,m.base,0,.24,3.4,5.5,.62,3.6);block(terrace,m.paving,0,.61,3.4,5.6,.14,3.6);
 for(let i=0;i<4;i++){const h=.6-i*.15;block(terrace,m.trim,0,h/2,5.15+i*.35,6.0+i*.25,h,.39);}

 // The seven-bay grand staircase belongs on the east side (local -Z).
 const perron=feature('perron','EST · Grand escalier','E',Math.PI);
 for(let i=0;i<10;i++){const h=.16*(10-i);block(perron,m.trim,0,h-.075,D/2+1.0+i*.4,3.8+.08*i,.15,.43);}for(const x of [-2.1,2.1])for(let i=0;i<11;i++)baluster(perron,m.trim,x,1.55-i*.12,D/2+.8+i*.39,.75);
 for(const x of [-2.1,2.1]){const a=new THREE.Vector3(x,2.02,D/2+.5),b=new THREE.Vector3(x,.72,D/2+5.05),len=a.distanceTo(b),bar=block(perron,m.trim,0,0,0,.18,.2,len);bar.position.copy(a.clone().add(b).multiplyScalar(.5));bar.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),b.sub(a).normalize());}
 for(const side of [-1,1]){const shape=new THREE.Shape();shape.moveTo(0,1.68);shape.lineTo(4.65,.14);shape.lineTo(4.65,-.04);shape.lineTo(4.12,-.04);shape.quadraticCurveTo(2.0,1.15,0,.8);shape.closePath();const g=new THREE.ExtrudeGeometry(shape,{depth:.28,bevelEnabled:false,curveSegments:20});const o=mesh(perron,g,m.trim,'Arc sous le perron');o.rotation.y=-Math.PI/2;o.position.set(side*2.1+.14,0,D/2+.55);}

 // West box garden faces the water mirror and the outbuildings.
 const garden=feature('garden','OUEST · Jardin de buis','W',Math.PI);
 garden.userData.reference='PHOTO-2025-01-02-18-14-32 4.JPG';
 for(let i=0;i<3;i++)block(garden,m.trim,0,.24*(3-i)/2,-D/2-1-i*.43,3.3,.24*(3-i),.46);
 groundPlane(garden,m.gardenPavers,-19.1,19.1,-19.7,-9.46);groundPlane(garden,m.gardenPavers,-2.4,2.4,-9.46,-6.8);
 // Four low, rectangular compartments; five domes by the house, four by the lawn.
 function boxBed(x,z,w,d,count,front=false){block(garden,m.soil,x,.03,z,w-.4,.09,d-.4);for(const s of [-1,1]){hedgeBlock(garden,m.hedge,x,.24,z+s*(d/2-.2),w,.48,.4,.075);hedgeBlock(garden,m.hedge,x+s*(w/2-.2),.24,z,.4,.48,d,.075);}for(let i=0;i<count;i++)topiary(garden,m.hedge,x-w/2+1.1+(w-2.2)*i/(count-1),z,front?.98:.72,front?.67:.87,'dome',.12);}
 for(const s of [-1,1]){boxBed(s*7.6,-10.55,10,2,5);boxBed(s*7.8,-17.2,10.4,2.3,4,true);
  for(const [v,h] of [[11.3,4.55],[17.15,4.0]]){topiary(garden,m.hedge,s*13.85,-v,1.05,h,'cone');topiary(garden,m.hedge,s*12.95,-v-.45,.56,.70);}
  topiary(garden,m.hedge,s*3.25,-19.1,1.20,1.45);
  topiary(garden,m.hedge,s*14.8,-19.0,.78,1.0);
  // The north blocks are squarer; the south masses have softer, rounded shoulders.
  for(const v of [11.45,17.15])hedgeBlock(garden,m.hedge,s*16.75,s===1?1.45:1.22,-v,4.7,s===1?2.9:2.45,3.45,s===1?.16:.55);
 }

 // East gravel court and the large clipped box trees photographed in IMG_2167.
 const parking=feature('eastParking','EST · Parking en graviers','E',Math.PI);
 parking.userData.reference='IMG_2167.HEIC ; présence et usage confirmés par le propriétaire';
 groundPlane(parking,m.gravel,-19.7,19.7,7.0,21.3,(u,v)=>!(u>15.35&&v<8.0));
 const eastBox=feature('eastBox','EST · Gros buis du parking','E',Math.PI);
 eastBox.userData.reference='IMG_2167.HEIC ; positions et gabarits estimés par recoupement photographique';
 for(const [u,v,r,h] of [[-16.8,19.5,1.70,3.75],[-10.6,20.0,1.95,4.5],[-4.8,20.2,2.05,4.65],[1.2,20.0,1.95,4.15],[7.0,19.7,2.20,3.20],[13.2,19.0,2.00,5.15]])topiary(eastBox,m.hedge,u,v,r,h,'column');
 topiary(eastBox,m.hedge,17.35,9.0,1.40,5.6,'cone');

 // The narrow basement clearances visible next to the west box garden in photos 01/08.
 const basement=feature('westBasement','OUEST · Soupiraux et grilles du jardin','W',Math.PI);
 basement.userData.orientationSource='Recoupement des photographies : grilles le long des buis côté ouest';
 for(const side of [-1,1]){const x=side*9.0,w=12.8;block(basement,m.brick,x,-2.05,-8.03,w,.16,2.8);block(basement,m.base,x,-.83,-9.47,w,2.5,.43);block(basement,m.brick,x,.45,-9.47,w,.16,.53);
  for(const end of [side*2.58,side*15.5]){block(basement,m.base,end,-.83,-8.04,.44,2.5,2.85);block(basement,m.brick,end,.45,-8.04,.53,.16,2.95);ironGuard(basement,m.metal,end,.56,-8.05,2.8,Math.PI/2);}
  ironGuard(basement,m.metal,x,.56,-9.48,w);for(const offset of [-3.7,0,3.7]){block(basement,m.recess,x+offset,-.68,-6.73,1.03,1.3,.12);ironGuard(basement,m.metal,x+offset,-1.21,-6.84,.95);}
 }

 // North English courtyard: brick floor, retaining walls and descending access stairs.
 const court=feature('northCourt','NORD · Cour anglaise','N',-Math.PI/2,-W/2);
 block(court,m.brick,0,-2.05,2.6,15.2,.16,5.2);
 block(court,m.base,0,-.83,5.2,15.65,2.5,.45);block(court,m.brick,0,.45,5.2,15.75,.16,.55);stoneGuard(court,0,.52,5.2,15.5);
 block(court,m.brick,-7.6,-.83,2.6,.45,2.5,5.2);block(court,m.trim,-7.6,.45,2.6,.55,.16,5.3);stoneGuard(court,-7.6,.52,2.6,5.2,Math.PI/2);
 // Access is at the opposite (west) end; leave a matching opening in the perimeter.
 for(const [v,length] of [[.78,1.56],[4.38,1.64]]){block(court,m.brick,7.6,-.83,v,.45,2.5,length);block(court,m.trim,7.6,.45,v,.55,.16,length);stoneGuard(court,7.6,.52,v,length,Math.PI/2);}
 const northStair=feature('northStair','NORD · Escalier de la cour, accès ouest','N',-Math.PI/2,-W/2);
 const entrance=castle.localToWorld(new THREE.Vector3(-W/2-2.55,0,7.82)),stairTop=height(entrance.x,entrance.z)+.075,stairRise=(stairTop+1.97)/14;
 block(northStair,m.brick,7.82,stairTop-.065,2.55,1.15,.13,1.9);
 for(let i=0;i<14;i++){const top=stairTop-i*stairRise;block(northStair,m.brick,7.3-i*.31,top-.065,2.55,.34,.13,1.9);}
 const ca=new THREE.Vector3(7.4,stairTop+.95,3.56),cb=new THREE.Vector3(3.16,-1.02,3.56),handrail=block(northStair,m.metal,0,0,0,.045,.05,ca.distanceTo(cb));handrail.position.copy(ca.clone().add(cb).multiplyScalar(.5));handrail.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),cb.sub(ca).normalize());for(let i=0;i<8;i++)block(northStair,m.metal,7.25-i*.58,stairTop+.47-i*(stairTop+1.97)/7,3.56,.035,.94,.035);
 for(const u of [-4.1,0,4.1]){block(court,m.recess,u,-.68,.065,1.03,1.3,.12);ironGuard(court,m.metal,u,-1.21,.16,.95);}
 for(const g of Object.values(features))compact(g);
 // Keep low hedges and ground finishes above the existing interpolated terrain.
 // These small surface adjustments do not add surveyed topographic measurements.
 for(const g of [garden,parking,eastBox])drapeGround(g);

 const outbuildings=new THREE.Group();outbuildings.name='Dépendances — reconstitution photographique';root.add(outbuildings);
 function wing(a,b,depth,eaves,nWindows,balcony=false){const g=new THREE.Group();g.name='Aile des dépendances';outbuildings.add(g);const cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2,L=Math.hypot(b[0]-a[0],b[1]-a[1]);g.position.set(cx,height(cx,cz),cz);g.rotation.y=-Math.atan2(b[1]-a[1],b[0]-a[0]);block(g,m.brick,0,.4,0,L,.8,depth);block(g,m.stucco,0,eaves/2,0,L,eaves,depth);hipRoof(g,m.roof,L+.65,depth+.65,eaves,2.6);for(const f of [-1,1]){const face=new THREE.Group();g.add(face);face.rotation.y=f===1?0:Math.PI;face.position.z=f*depth/2;if(f===1)block(face,m.brick,0,eaves/2,.012,L,eaves,.02);block(face,m.brick,0,3.25,.03,L,.18,.16);for(let i=0;i<nWindows;i++){const x=-L/2+2+(L-4)*i/Math.max(1,nWindows-1);windowDetail(face,{...m,trim:m.brick},x,5.05,.04,{w:1.05,h:1.48,shutters:false});if(f===1)windowDetail(face,{...m,trim:m.brick},x,1.65,.04,{w:1.25,h:1.8,shutters:false});if(f===-1){const aw=balcony?2.8:2.4;for(const dx of [-aw/2,aw/2])block(face,m.brick,x+dx,1.2,.05,.24,2.4,.22);archBand(face,m.brick,x,2.4,.1,aw,1.1,.29,.22);if(balcony||i===0){block(face,m.glass,x,1.37,.04,aw-.24,2.7,.13);for(const dx of [-.7,0,.7])block(face,m.shutter,x+dx,1.35,.18,.055,2.7,.07);block(face,m.shutter,x,1.8,.18,aw,.06,.09);}}}if(balcony&&f===-1){block(face,m.trim,0,3.45,.39,L,.20,1.12);greekRail(face,m.metal,0,3.55,.89,L,.79);}for(const x of [-L/2+.13,L/2-.13])block(face,m.brick,x,eaves/2,.05,.35,eaves,.24);}}
 wing([-226,62],[-208,59.1],8.1,6.5,5,false);wing([-208.2,59.3],[-194.8,68.1],8.1,6.5,4,true);
 const tower=new THREE.Group();tower.name='Pavillon des dépendances';outbuildings.add(tower);tower.position.set(-192.6,height(-192.6,67.4)-.2,67.4);tower.rotation.y=.17;block(tower,m.stucco,0,5.95,0,7.4,11.9,8);block(tower,m.brick,0,5.95,4.012,7.4,11.9,.02);block(tower,m.brick,0,.9,0,7.45,1.8,8.05);for(const y of [3.7,7.1,10.0])block(tower,m.brick,0,y,0,7.5,.16,8.1);
 for(let k=0;k<4;k++){const f=new THREE.Group();tower.add(f);f.rotation.y=k*Math.PI/2;f.position.set(Math.sin(k*Math.PI/2)*(k%2?3.7:4),0,Math.cos(k*Math.PI/2)*4);for(const x of [-1.8,1.8])for(const y of [2.0,5.45,8.75])windowDetail(f,m,x,y,0,{w:.88,h:1.52,shutters:false});}
 frustumRoof(tower,m.roof,8.15,8.8,11.9,.08,.08,18.2);column(tower,m.metal,0,18.65,0,.04,1.0,.02);
 for(const x of [-2.3,2.3]){const g=new THREE.Group();tower.add(g);g.position.set(x,11.55,-3.85);const sh=new THREE.Shape();sh.moveTo(-1.6,0);sh.lineTo(1.6,0);sh.lineTo(0,2.5);sh.closePath();mesh(g,new THREE.ExtrudeGeometry(sh,{depth:.22,bevelEnabled:false}),m.stucco);const circle=mesh(g,new THREE.CylinderGeometry(.34,.34,.07,20),m.metal);circle.rotation.x=Math.PI/2;circle.position.set(0,.98,.26);}
 // Narrow brick return visible behind the main wings.
 const barn=new THREE.Group();barn.name='Retour en briques';outbuildings.add(barn);barn.position.set(-224,height(-224,79),79);barn.rotation.y=.14;block(barn,m.brick,0,1.9,0,4.1,3.8,26.0);hipRoof(barn,m.roof,4.5,26.4,3.8,.7);compact(outbuildings);


 // The March/June views connect the pavilion to the small eastern annexe.
 // The route and height of this retaining wall are interpreted and remain adjustable.
 const retaining=new THREE.Group();retaining.name='Mur pavillon–annexe — implantation estimée';root.add(retaining);
 const wa=[-188.1,66.9],wb=[-144.1,55.9],wallLength=Math.hypot(wb[0]-wa[0],wb[1]-wa[1]),wallAngle=-Math.atan2(wb[1]-wa[1],wb[0]-wa[0]);
 for(let i=0;i<18;i++){const t=(i+.5)/18,x=wa[0]+(wb[0]-wa[0])*t,z=wa[1]+(wb[1]-wa[1])*t,h=t<.28?2.1:3.3,g=new THREE.Group();retaining.add(g);g.position.set(x,height(x,z)-.18,z);g.rotation.y=wallAngle;block(g,m.brick,0,h/2,0,wallLength/18+.04,h,.5);block(g,m.trim,0,h+.04,0,wallLength/18+.04,.13,.61);if(t<.28)ironGuard(g,m.metal,0,h+.13,0,wallLength/18);}
 compact(retaining);

 const ancillary=new THREE.Group();ancillary.name='Autres emprises — volumes indicatifs';root.add(ancillary);
 for(const b of data.buildings.filter(b=>!['building-636','building-609'].includes(b.id))){const g=new THREE.Group();g.name='Annexe '+b.id.replace('building-','');ancillary.add(g);const h=b.bdtopo_height&&b.bdtopo_height<15?b.bdtopo_height:3.2;g.position.y=b.altitude-datum;for(const polygon of b.footprint){const s=new THREE.Shape(polygon[0].map(p=>new THREE.Vector2(p[0],-p[1])));for(const ring of polygon.slice(1))s.holes.push(new THREE.Path(ring.map(p=>new THREE.Vector2(p[0],-p[1]))));const geom=new THREE.ExtrudeGeometry(s,{depth:h,bevelEnabled:false});geom.rotateX(-Math.PI/2);mesh(g,geom,b.id==='building-610'?m.brick:m.stucco);}const r=new THREE.Group();g.add(r);r.position.set(b.center[0],0,b.center[1]);r.rotation.y=-b.angle;hipRoof(r,m.roof,b.length+.4,b.depth+.4,h,Math.min(2.5,b.depth*.34));}compact(ancillary);

 // The pond outline is tied to parcel B78; level and banks remain approximate.
 const pondParcel=data.parcels.find(p=>p.code==='B78');const pondGroup=new THREE.Group();pondGroup.name='Pièce d’eau — contour cadastral';root.add(pondGroup);
 if(pondParcel){for(const polygon of pondParcel.polygons){const s=new THREE.Shape(polygon[0].map(p=>new THREE.Vector2(p[0],-p[1])));const g=new THREE.ShapeGeometry(s);g.rotateX(-Math.PI/2);const water=mesh(pondGroup,g,new THREE.MeshStandardMaterial({color:0x315a57,metalness:.38,roughness:.18,transparent:true,opacity:.9}),'Eau');water.position.y=height(...pondParcel.center)+.2;water.castShadow=false;}}

 // Vegetation locations sampled inside IGN vegetation polygons; species and crowns are illustrative.
 const trees=new THREE.Group();trees.name='Végétation — implantation IGN, houppiers estimés';root.add(trees);
 const treePositions=[];for(let z=bounds[1]+6;z<bounds[3];z+=11)for(let x=bounds[0]+6;x<bounds[2];x+=11){const tx=x+(rng()-.5)*9,tz=z+(rng()-.5)*9;const veg=data.vegetation.find(v=>insidePolygons(tx,tz,v.polygons));if(!veg)continue;if(data.buildings.some(b=>Math.hypot(tx-b.center[0],tz-b.center[1])<Math.max(7,Math.sqrt(b.area)*.72)))continue;const dx=tx-castleData.center[0],dz=tz-castleData.center[1];if(Math.hypot(dx,dz)<32)continue;if(veg.nature==='Verger'&&rng()<.7)continue;treePositions.push({x:tx,z:tz,h:veg.nature==='Verger'?5+rng()*4:11+rng()*13,r:4+rng()*4});}
 const barkGeo=new THREE.CylinderGeometry(.035,.065,.67,6);barkGeo.translate(0,.32,0);
 const foliageParts=[];for(let j=0;j<7;j++){const geo=new THREE.SphereGeometry(.27,7,5);geo.scale(.8+rng()*.45,1.1+rng()*.4,.8+rng()*.45);const a=j*2.4,rad=j===0?0:.20;geo.translate(Math.cos(a)*rad,.61+(j%3)*.06,Math.sin(a)*rad);foliageParts.push(geo.toNonIndexed());}
 const crownGeo=mergeGeometries(foliageParts,false);crownGeo.computeVertexNormals();const leafMat=new THREE.MeshStandardMaterial({color:0x648441,roughness:1});leafMat.name='Feuillage indicatif';const crowns=new THREE.InstancedMesh(crownGeo,leafMat,treePositions.length),trunks=new THREE.InstancedMesh(barkGeo,m.bark,treePositions.length);crowns.name='Houppiers';trunks.name='Troncs';crowns.castShadow=true;crowns.receiveShadow=true;trunks.castShadow=true;const matrix=new THREE.Matrix4(),quat=new THREE.Quaternion(),color=new THREE.Color();
 treePositions.forEach((p,i)=>{quat.setFromAxisAngle(new THREE.Vector3(0,1,0),rng()*Math.PI*2);matrix.compose(new THREE.Vector3(p.x,height(p.x,p.z)-.1,p.z),quat,new THREE.Vector3(p.r*2.8,p.h,p.r*2.8));crowns.setMatrixAt(i,matrix);color.setHSL(.235+rng()*.065,.20+rng()*.22,.24+rng()*.13);crowns.setColorAt(i,color);matrix.compose(new THREE.Vector3(p.x,height(p.x,p.z),p.z),quat,new THREE.Vector3(p.h,p.h,p.h));trunks.setMatrixAt(i,matrix);});crowns.instanceMatrix.needsUpdate=true;trunks.instanceMatrix.needsUpdate=true;trees.add(crowns,trunks);

 const projectGroup=new THREE.Group();projectGroup.name='Scénario de travaux — volumes d’étude';root.add(projectGroup);
 function createVolume(spec){const material=new THREE.MeshStandardMaterial({color:0xc27d53,roughness:.7,transparent:true,opacity:.78});const o=mesh(projectGroup,new THREE.BoxGeometry(1,1,1),material,spec.name);o.userData={...spec};updateVolume(o,spec);return o;}
 function updateVolume(o,spec){o.userData={...spec};o.name=spec.name;o.scale.set(spec.width,spec.height,spec.depth);o.position.set(spec.x,height(spec.x,spec.z)+spec.height/2+.07,spec.z);o.rotation.y=-spec.rotation*Math.PI/180;}
 function setFinishes(wall,roof,enabled=true){m.stone.color.set(enabled&&wall==='light'?0xe0d9c5:enabled&&wall==='warm'?0xd3bb8c:palette.stone);m.trim.color.set(enabled&&wall==='light'?0xe9e3d2:palette.trim);m.roof.color.set(enabled&&roof==='restored'?0x465363:palette.roof);m.roof.map=enabled&&roof==='restored'?null:(textures.roof||null);m.roof.needsUpdate=true;}
 function castlePoint(x,y,z){castle.updateMatrixWorld();return castle.localToWorld(new THREE.Vector3(x,y,z));}
 const views={castle:{position:castlePoint(31,29,-70),target:castlePoint(0,7,0),label:'EST · GRAND ESCALIER'},garden:{position:castlePoint(-30,24,70),target:castlePoint(0,7,0),label:'OUEST · BUIS & MIROIR D’EAU'},outbuildings:{position:new THREE.Vector3(-150,height(-190,64)+30,9),target:new THREE.Vector3(-211,height(-211,66)+5,67),label:'DÉPENDANCES · PAVILLON & GALERIE'},estate:{position:new THREE.Vector3(-650,850,880),target:new THREE.Vector3(-10,-3,5),label:'DOMAINE · 19 PARCELLES'}};
 views['outbuildings-rear']={position:new THREE.Vector3(-170,24,121),target:new THREE.Vector3(-201,height(-201,66)+5,66),label:'DÉPENDANCES · ARRIÈRE & MUR'};
 views['lightwells']={position:castlePoint(-37,14,13),target:castlePoint(-18,-.3,0),label:'NORD · COUR ANGLAISE'};
 views['terrace']={position:castlePoint(42,14,-17),target:castlePoint(18,2,0),label:'SUD · TERRASSE À BALUSTRADE'};
 views['west-basement']={position:castlePoint(-20,12,23),target:castlePoint(-6,0,8),label:'OUEST · SOUPIRAUX DU JARDIN'};
 views['garden-detail']={position:castlePoint(0,35,49),target:castlePoint(0,.5,13),label:'OUEST · DESSIN DES BUIS'};
 views['east-parking']={position:castlePoint(-27,22,-49),target:castlePoint(0,3,-12),label:'EST · PARKING & GROS BUIS'};
 return {root,terrain,terrainMaterial,parcelGroup,parcelLines,selectParcel,castle,castleData,features,ancillary,outbuildings,trees,treePositions,pondGroup,projectGroup,createVolume,updateVolume,setFinishes,height,rawHeight,datum,views,materials:m};
}
