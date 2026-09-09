// Pure-logic tests for web/surveys/manifest.js — no browser, no fixtures beyond
// what's inlined here. Run with `node --test tests/*.test.mjs` (or `npm test`).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FRAME, SITE_ID, IDENTITY,
  lambertToWorld, worldToLambert, transformPoint,
  validateTransform, assetURL, validateManifest, variantFor,
} from '../web/surveys/manifest.js';

const BASE_URL = 'https://example.test/domaine-grangues-3d/index.html';

function baseManifest() {
  return {
    schemaVersion: 1,
    siteId: SITE_ID,
    referenceFrame: { ...FRAME, origin: [...FRAME.origin] },
    sources: [],
  };
}

function readySource(overrides = {}) {
  return {
    id: 'drone-exterior',
    label: 'Relevé drone extérieur',
    role: 'exterior',
    format: '3d-tiles',
    availability: 'ready',
    coordinateSpace: 'local-meters',
    sourceToWorld: IDENTITY,
    registration: { status: 'checked' },
    replaces: ['terrain'],
    entry: { position: [10, 5, 10], target: [0, 0, 0] },
    variants: [{ quality: 'mobile', uri: 'tiles/mobile/tileset.json' }],
    ...overrides,
  };
}

test('lambertToWorld / worldToLambert round-trip and match the sign convention (north = -Z)', () => {
  const lambert = [FRAME.origin[0] + 12.5, FRAME.origin[1] - 7.25, FRAME.origin[2] + 3.1];
  const world = lambertToWorld(lambert);
  const close = (a, b) => Math.abs(a - b) < 1e-9;
  assert.ok(close(world[0], 12.5), `x: ${world[0]}`); // east offset -> +X
  assert.ok(close(world[1], 3.1), `y: ${world[1]}`); // altitude offset -> +Y
  assert.ok(close(world[2], 7.25), `z: ${world[2]}`); // a northward origin-relative offset (n = origin.n - 7.25) maps to +Z
  const back = worldToLambert(world);
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - lambert[i]) < 1e-9, `axis ${i}: ${back[i]} !== ${lambert[i]}`);
});

test('transformPoint applies a column-major affine matrix like THREE.Matrix4', () => {
  // Pure translation by (5, 0, -3).
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, -3, 1];
  assert.deepEqual(transformPoint(m, [1, 2, 3]), [6, 2, 0]);
});

test('validateTransform accepts identity and a scaled rotation', () => {
  assert.deepEqual(validateTransform(IDENTITY), IDENTITY);
  const s = 2, c = Math.cos(0.3) * s, sn = Math.sin(0.3) * s;
  const rotScale = [c, 0, -sn, 0, 0, s, 0, 0, sn, 0, c, 0, 1, 2, 3, 1];
  assert.doesNotThrow(() => validateTransform(rotScale));
});

test('validateTransform rejects a non-uniform scale (shear/stretch)', () => {
  const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  m[0] = 3; // stretch only the X axis
  assert.throws(() => validateTransform(m), /rotation et une échelle uniforme/);
});

test('validateTransform rejects a mirrored (determinant <= 0) matrix', () => {
  const mirrored = [-1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  assert.throws(() => validateTransform(mirrored), /inverse le repère/);
});

test('validateTransform rejects coordinates far outside a local frame', () => {
  const farAway = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 50000, 0, 0, 1];
  assert.throws(() => validateTransform(farAway), /Coordonnées trop grandes/);
});

test('assetURL accepts a relative HTTPS-resolved URL and rejects credentials/other schemes', () => {
  assert.equal(assetURL('tiles/tileset.json', BASE_URL), 'https://example.test/domaine-grangues-3d/tiles/tileset.json');
  assert.throws(() => assetURL('ftp://example.test/x', BASE_URL), /HTTP\(S\)/);
  assert.throws(() => assetURL('https://user:pass@example.test/x', BASE_URL), /identifiants/);
});

test('validateManifest accepts a well-formed manifest with one ready source', () => {
  const manifest = baseManifest();
  manifest.sources.push(readySource());
  const result = validateManifest(manifest, BASE_URL);
  assert.equal(result.sources[0].variants[0].uri, `${new URL('tiles/mobile/tileset.json', BASE_URL)}`);
});

test('validateManifest accepts a pending source with no variants', () => {
  const manifest = baseManifest();
  manifest.sources.push({ id: 'polycam-interior', label: 'Intérieurs Polycam', role: 'interior', format: 'glb', availability: 'pending' });
  assert.doesNotThrow(() => validateManifest(manifest, BASE_URL));
});

test('validateManifest rejects a manifest for the wrong site or schema version', () => {
  assert.throws(() => validateManifest({ ...baseManifest(), siteId: 'other-site' }, BASE_URL), /domaine de Grangues/);
  assert.throws(() => validateManifest({ ...baseManifest(), schemaVersion: 2 }, BASE_URL), /domaine de Grangues/);
});

test('validateManifest rejects an incompatible reference frame (wrong origin)', () => {
  const manifest = baseManifest();
  manifest.referenceFrame.origin = [FRAME.origin[0] + 100, FRAME.origin[1], FRAME.origin[2]];
  assert.throws(() => validateManifest(manifest, BASE_URL), /Repère incompatible/);
});

test('validateManifest rejects duplicate source ids', () => {
  const manifest = baseManifest();
  manifest.sources.push(readySource(), readySource());
  assert.throws(() => validateManifest(manifest, BASE_URL), /identifiant unique/);
});

test('validateManifest rejects a GLB variant heavier than its profile budget', () => {
  const manifest = baseManifest();
  manifest.sources.push(readySource({
    format: 'glb',
    role: 'interior',
    floorId: 'rdc',
    variants: [{ quality: 'mobile', uri: 'floor.glb', byteSize: 999 * 1024 * 1024 }],
  }));
  assert.throws(() => validateManifest(manifest, BASE_URL), /trop lourd/);
});

test('validateManifest rejects an interior source with no floorId', () => {
  const manifest = baseManifest();
  manifest.sources.push(readySource({ role: 'interior', format: 'glb', variants: [{ quality: 'mobile', uri: 'a.glb', byteSize: 1024 }] }));
  assert.throws(() => validateManifest(manifest, BASE_URL), /étage requis/);
});

test('validateManifest rejects a degenerate entry view (camera at the target)', () => {
  const manifest = baseManifest();
  manifest.sources.push(readySource({ entry: { position: [1, 1, 1], target: [1, 1, 1] } }));
  assert.throws(() => validateManifest(manifest, BASE_URL), /point de vue invalide/);
});

test('validateManifest does not mutate the caller\'s input object', () => {
  const manifest = baseManifest();
  manifest.sources.push(readySource());
  const frozenId = manifest.sources[0].id;
  validateManifest(manifest, BASE_URL);
  assert.equal(manifest.sources[0].id, frozenId);
  assert.equal(manifest.sources[0].variants[0].uri, 'tiles/mobile/tileset.json'); // untouched: assetURL ran on the clone
});

test('variantFor returns the exact quality when available, and falls back mobile-for-desktop only', () => {
  const source = readySource({ variants: [{ quality: 'mobile', uri: 'a' }] });
  assert.equal(variantFor(source, 'mobile').uri, 'a');
  assert.equal(variantFor(source, 'desktop').uri, 'a'); // desktop falls back to mobile
  const noVariants = readySource({ variants: [] });
  // Implementation detail worth pinning down: requesting 'mobile' with nothing available
  // short-circuits straight to the literal `null` in variantFor's fallback branch, while
  // requesting 'desktop' falls through to an unmatched `.find()` (undefined). Either way,
  // mobile never silently receives a heavier variant it didn't ask for.
  assert.equal(variantFor(noVariants, 'mobile'), null);
  assert.equal(variantFor(noVariants, 'desktop'), undefined);
});
