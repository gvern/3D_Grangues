# Notes de reprise — 9 septembre 2026

Ce dépôt a eu deux implémentations parallèles de la même idée (navigation 3D unifiée
intérieur/extérieur) le même jour, préparées indépendamment sans se voir : la mienne
(commit `443d10a`, conservée pour référence dans la branche `backup/my-3dtiles-approach`)
et celle fusionnée dans `main` via la PR #1 (`feat/unified-surveys`, commit `2ce92a7`),
toutes deux basées sur `52a4b5e` et donc mutuellement invisibles au moment où chacune a
été écrite. **Ce document explique ce qui a été trouvé cassé dans la version fusionnée et
ce qui a été corrigé pour la rendre réellement exécutable** — sans revenir sur son
architecture, qui est plus rigoureuse que la mienne (validation d'entrée systématique,
annulation/nettoyage des chargements, profils mobile/desktop, budgets explicites) et a
donc été conservée comme base.

## Ce qui était cassé

`main` après la fusion de la PR #1 contenait le code source (`web/app.js`, `web/scene.js`,
`web/surveys/*.js`, `scripts/align-survey.py`, `scripts/build-survey-vendor.mjs`) et sa
documentation (`docs/AUDIT-INTEGRATION-3D.md`, `docs/INTEGRATION-RELEVES.md`,
`docs/PR-INTEGRATION.md`, `docs/RECEPTION-RELEVES.md`), mais pas :

1. **`web/vendor/`** — le moteur Three.js de base (`three.module.js`, `three.core.js`,
   `OrbitControls.js`, `BufferGeometryUtils.js`, `GLTFExporter.js`). `web/index.html`
   déclare `{"imports":{"three":"./vendor/three.module.js"}}` : sans ce fichier, **le
   site ne pouvait pas démarrer du tout** — la toute première ligne de `app.js`
   (`import * as THREE from 'three'`) échouait. Ce n'était pas une dépendance optionnelle
   comme les adaptateurs `surveys/` ; c'est le moteur de rendu lui-même.
2. **`scripts/verify-model.mjs`, `scripts/module-loader.mjs`, `tests/*`** — référencés par
   les scripts `test`, `test:alignment` et `verify:model` de `package.json`, mais absents
   du dépôt. `npm test`/`npm run verify:model` échouaient immédiatement (fichier introuvable).
3. Un bug de chemin dans **`scripts/build-survey-vendor.mjs`** : il écrivait dans
   `dist/vendor/surveys`, un répertoire qui n'existe pas dans ce dépôt (ici tout est sous
   `web/`, jamais `dist/`) — reliquat de l'adaptation depuis les sources externes du site
   (qui utilisaient `dist/`) vers ce dépôt.

Point 1 et 3 s'expliquent probablement l'un l'autre : au moment de renommer `dist/` en
`web/` pour coller à la structure de ce dépôt, le moteur Three.js vendorisé n'a pas suivi
le renommage (ou n'a simplement pas été copié depuis les sources externes), et le script
de build n'a pas été mis à jour non plus.

## Ce qui a été corrigé

- **`web/vendor/{three.module.js,three.core.js,OrbitControls.js,BufferGeometryUtils.js,GLTFExporter.js}`**
  restaurés — vérifiés **octet pour octet identiques** à `three@0.180.0` fraîchement
  installé via `npm ci` (même version que celle épinglée dans `package.json`), donc pas de
  divergence de version introduite.
- **`scripts/build-survey-vendor.mjs`** : `dist/vendor/surveys` → `web/vendor/surveys`.
  `npm run build` régénère maintenant réellement `web/vendor/surveys/{loaders,tiles}.js`
  (+ décodeurs Draco/Basis, licences) — poids vérifié : 84 490 octets gzip pour les deux
  bundles combinés, ce qui correspond exactement aux « 85 ko gzip » annoncés dans
  `docs/AUDIT-INTEGRATION-3D.md`, donc cette estimation était basée sur un vrai build de
  ce même code, juste avec le chemin de sortie qui a ensuite divergé.
- **`scripts/verify-model.mjs`** écrit et vérifié : fait tourner `buildDomain()` (depuis
  `web/scene.js`) sur un petit jeu de données synthétique (pas le vrai `domain.json`,
  propriétaire et non commité) et vérifie que tous les groupes attendus par
  `mountSurveys()` existent, que le repère survit dans `root.userData`, qu'aucune
  géométrie ni vue prédéfinie ne contient de valeur non finie. Résultat : 49 meshes, 0
  valeur non finie — cohérent avec les « 49 meshes » cités dans l'audit pour le vrai jeu
  de données.
- **`scripts/module-loader.mjs`** : abandonné plutôt que reconstruit — inutile en
  pratique. `scene.js` et `manifest.js` s'importent directement sous Node une fois
  `npm ci` exécuté (`three` se résout nativement depuis `node_modules`), donc
  `verify:model` dans `package.json` est simplifié en `node scripts/verify-model.mjs`,
  sans `--experimental-loader`.
- **`tests/manifest.test.mjs`** (17 tests) et **`tests/test_alignment.py`** (15 tests)
  écrits et vérifiés (`npm test` / `npm run test:alignment` passent tous les deux) — voir
  le tableau dans `docs/INTEGRATION-RELEVES.md`. Ce sont des tests de logique pure
  (validation de manifeste, recalage par points homologues) ; ils **ne couvrent pas** les
  tests HTTP/GLB/PNTS/LOD/cache que `docs/AUDIT-INTEGRATION-3D.md` décrivait à l'origine —
  ceux-là n'étaient pas dans les fichiers commités et n'ont pas été reconstruits ici (il
  faudrait un serveur de fixtures HTTP synthétiques imitant le format
  `3d-tiles-renderer`/glTF). `web/surveys/loaders.js` et `web/surveys/session.js` restent
  donc non couverts par un test automatisé dans ce dépôt.
- **`web/assets/photos.json`** restauré (copie d'une capture antérieure du déploiement
  live, 30 entrées) — absent de la PR fusionnée, faisait échouer le chargement de l'onglet
  Références. Voir `web/assets/README.md` : `index.html` affiche désormais « trente et une
  photographies », donc ce fichier a probablement une entrée de retard sur le déploiement
  actuel — à re-synchroniser.

## Vérifié après correctif

```
npm ci --legacy-peer-deps   # OK
npm run build                # régénère web/vendor/surveys/*
npm test                     # 17/17
npm run test:alignment       # 15/15
npm run verify:model         # 49 meshes, 0 valeur non finie
python3 -m http.server 8000 --directory web
# chargé dans Chromium headless : aucune erreur de résolution de module ;
# dégradation propre vers #error en l'absence de domain.json/ortho.jpg (attendu,
# ces fichiers sont volontairement hors dépôt — voir web/assets/README.md)
```

## Ce qui reste

Identique à ce que `docs/INTEGRATION-RELEVES.md` et `docs/RECEPTION-RELEVES.md`
décrivaient déjà : obtenir un export ATIS réel et un export Polycam, les points de
contrôle pour le recalage, et valider le rendu réel (GPU, décodage de textures
compressées, performance) sur un jeu de données réel — rien de tout cela n'a changé avec
ce correctif, qui ne portait que sur « est-ce que le code déjà écrit tourne ».
