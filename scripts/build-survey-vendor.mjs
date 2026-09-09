import { build } from 'esbuild';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';

// Build only the new optional adapters. Preserve the existing vendored Three engine.
const output='web/vendor/surveys';
await mkdir(output,{recursive:true});
const entries = {
  loaders: `export {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
export {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
export {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
export {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';`,
  tiles: `export {TilesRenderer,PNTSLoader} from '3d-tiles-renderer/three';
export {GLTFExtensionsPlugin} from '3d-tiles-renderer/src/three/plugins/GLTFExtensionsPlugin.js';`,
};
for (const [name,contents] of Object.entries(entries)) {
  const result = await build({stdin:{contents,resolveDir:process.cwd(),sourcefile:`${name}-entry.js`},outfile:`${output}/${name}.js`,bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,legalComments:'linked',metafile:true,plugins:[{name:'shared-three',setup(b){b.onResolve({filter:/^three$/},()=>({path:'three',external:true}));}}]});
  await writeFile(`${output}/${name}.meta.json`,JSON.stringify(result.metafile,null,2)+'\n');
}
for (const [name,source,files] of [
  ['draco','draco/gltf',['draco_wasm_wrapper.js','draco_decoder.wasm']],
  ['basis','basis',['basis_transcoder.js','basis_transcoder.wasm']],
]) {
  await mkdir(`${output}/${name}`,{recursive:true});
  for(const file of files) await copyFile(`node_modules/three/examples/jsm/libs/${source}/${file}`,`${output}/${name}/${file}`);
}
await copyFile('node_modules/3d-tiles-renderer/LICENSE',`${output}/LICENSE-3d-tiles-renderer`);
await copyFile('node_modules/three/LICENSE',`${output}/LICENSE-three`);
await copyFile('node_modules/three/examples/jsm/libs/draco/README.md',`${output}/README-draco.md`);
await copyFile('node_modules/three/examples/jsm/libs/basis/README.md',`${output}/README-basis.md`);
console.log('Optional Three.js survey adapters and local WASM decoders built.');
