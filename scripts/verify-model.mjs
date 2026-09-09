#!/usr/bin/env node
// Runs buildDomain() against a small synthetic fixture (not the real, proprietary
// IGN/cadastre dataset — see web/assets/README.md) and checks the structural
// invariants the rest of the site depends on: every group mountSurveys()/app.js
// expects to find on the model (castle, terrain, trees, outbuildings, ancillary,
// pondGroup), the reference frame carried through to root.userData, and that no
// geometry ends up with non-finite vertices. This is a regression check on
// scene.js's contract, not a visual or photogrammetric accuracy check.
//
// Runs under plain Node (`node scripts/verify-model.mjs`, or `npm run
// verify:model`) — no browser and no --experimental-loader needed: `three`
// resolves via node_modules (installed by `npm ci`), and scene.js's only other
// import is the local ./vendor/BufferGeometryUtils.js, both handled by Node's
// default ES module resolution from the repo root.
import * as THREE from 'three';
import { buildDomain } from '../web/scene.js';

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function ring(points) {
  // Parcel/vegetation polygons are walked as explicit closed rings (scene.js
  // loops `i < ring.length - 1`), so the last point must repeat the first.
  return [...points, points[0]];
}

function footprint(points) {
  // buildDomain's ancillary loop reads `b.footprint` as an array of polygons,
  // each polygon an array of rings (outer ring first, holes after), each ring
  // an array of [x,z] points — one level deeper than it looks at first glance
  // (`for (const polygon of b.footprint) { new THREE.Shape(polygon[0]...) }`).
  // No duplicate closing point: Shape closes the path itself, and one throws
  // in a zero-length final segment that NaNs out of earcut triangulation.
  return [points];
}

function flatTerrain(bounds, step, altitude) {
  const nx = Math.round((bounds[2] - bounds[0]) / step) + 1;
  const nz = Math.round((bounds[3] - bounds[1]) / step) + 1;
  const altitudes = new Array(nx * nz).fill(altitude);
  return { nx, nz, step, altitudes };
}

// Bounds wide enough to cover every hardcoded absolute coordinate scene.js
// places outbuildings/annexes at (see the wing()/tower()/barn() calls, roughly
// x in [-230,-140], z in [50,90]) plus the castle-relative geometry near the
// origin — buildDomain's height() clamps sample points into the grid, so it
// never throws even for a point outside these bounds, but keeping them wide
// avoids degenerate (all-clamped-to-one-corner) height sampling.
const bounds = [-260, -60, 60, 220];
const origin = [477616.19, 6910397.86];
const castleAltitude = 112.79;

const fixture = {
  crs: 'EPSG:2154',
  origin,
  address: 'Fixture de test — pas une adresse réelle',
  area: 432790, // m^2, arbitrary but plausible (~43 ha, matches docs/AUDIT-INTEGRATION-3D.md's figure)
  bounds,
  terrain: flatTerrain(bounds, 10, castleAltitude),
  buildings: [
    { id: 'building-636', altitude: castleAltitude, center: [0, 0], angle: 0 }, // castle — required
    { id: 'building-609', altitude: castleAltitude, center: [-150, 40], angle: 0, footprint: [footprint([[-155, 35], [-145, 35], [-145, 45], [-155, 45]])], bdtopo_height: 4 },
    { id: 'building-610', altitude: castleAltitude, center: [40, -30], angle: .2, footprint: [footprint([[35, -35], [45, -35], [45, -25], [35, -25]])], bdtopo_height: 3.5, length: 10, depth: 8 },
    { id: 'building-700', altitude: castleAltitude, center: [30, 30], angle: 0, footprint: [footprint([[25, 25], [35, 25], [35, 35], [25, 35]])], bdtopo_height: 3, length: 10, depth: 10 },
  ],
  parcels: [
    { code: 'A1', area: 200000, center: [0, 100], polygons: [[ring([[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]]])]] },
    { code: 'B78', area: 5000, center: [0, 0], polygons: [[ring([[-10, -10], [10, -10], [10, 10], [-10, 10]])]] },
  ],
  vegetation: [
    { nature: 'Feuillu', polygons: [[ring([[bounds[0], bounds[1]], [bounds[2], bounds[1]], [bounds[2], bounds[3]], [bounds[0], bounds[3]]])]] },
  ],
};

let model;
try {
  model = buildDomain(fixture, {});
} catch (error) {
  fail(`buildDomain() threw on the synthetic fixture: ${error.stack || error}`);
  process.exit(1);
}

// 1. Every group the survey controller/app.js reaches into (see
// web/surveys/controller.js's `layers` map and web/app.js's use of `model.*`)
// must exist and be an Object3D.
for (const key of ['root', 'terrain', 'castle', 'trees', 'outbuildings', 'ancillary', 'pondGroup', 'projectGroup']) {
  if (!model[key] || typeof model[key].traverse !== 'function') fail(`model.${key} is missing or not an Object3D.`);
}

// 2. The reference frame must survive into root.userData unchanged — this is
// exactly what web/surveys/controller.js's mountSurveys() checks before
// trusting any survey's sourceToWorld matrix.
if (model.root.userData.crs !== fixture.crs) fail(`root.userData.crs = ${model.root.userData.crs}, expected ${fixture.crs}.`);
if (!fixture.origin.every((v, i) => Math.abs(v - model.root.userData.origin[i]) < 1e-9)) fail('root.userData.origin does not match the fixture origin.');

// 3. No NaN/Infinity anywhere in the generated geometry — the classic failure
// mode for a bad interpolation, a missing building, or a degenerate polygon.
let meshCount = 0, vertexCount = 0, instancedCount = 0;
model.root.traverse((o) => {
  if (o.isMesh) {
    meshCount++;
    const pos = o.geometry?.attributes?.position;
    if (!pos) { fail(`Mesh "${o.name}" has no position attribute.`); return; }
    vertexCount += pos.count;
    for (let i = 0; i < pos.array.length; i++) {
      if (!Number.isFinite(pos.array[i])) { fail(`Mesh "${o.name}" has a non-finite vertex coordinate.`); break; }
    }
  }
  if (o.isInstancedMesh) {
    instancedCount += o.count;
    const m = new THREE.Matrix4();
    for (let i = 0; i < o.count; i++) {
      o.getMatrixAt(i, m);
      if (!m.elements.every(Number.isFinite)) { fail(`InstancedMesh "${o.name}" has a non-finite instance matrix at index ${i}.`); break; }
    }
  }
});
if (meshCount === 0) fail('buildDomain() produced zero meshes.');
if (vertexCount === 0) fail('buildDomain() produced zero vertices.');

// 4. height()/rawHeight() must stay finite across the whole bounds, since
// TilesLayer/survey entry points and parcel outlines sample it freely.
for (let x = bounds[0]; x <= bounds[2]; x += 37) {
  for (let z = bounds[1]; z <= bounds[3]; z += 37) {
    if (!Number.isFinite(model.height(x, z))) fail(`model.height(${x}, ${z}) is not finite.`);
  }
}

// 5. views must all resolve to finite, non-degenerate camera/target pairs —
// goView() in app.js trusts these blindly.
for (const [name, v] of Object.entries(model.views)) {
  const p = v.position, t = v.target;
  if (![p.x, p.y, p.z, t.x, t.y, t.z].every(Number.isFinite)) fail(`View "${name}" has a non-finite position/target.`);
  if (p.distanceTo(t) < 1e-6) fail(`View "${name}" has coincident position and target.`);
}

if (process.exitCode) {
  console.error(`\nverify-model: FAILED (meshes=${meshCount}, vertices=${vertexCount}, instances=${instancedCount})`);
} else {
  console.log(`verify-model: OK — ${meshCount} meshes, ${vertexCount} vertices, ${instancedCount} instances (synthetic fixture, not the real domain.json).`);
}
