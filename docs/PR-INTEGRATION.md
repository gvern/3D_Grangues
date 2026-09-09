# Préparation : intégrer les relevés extérieurs et intérieurs

La maquette actuelle ne sait charger ni le nuage drone ni les futurs intérieurs. Elle doit conserver ses parcelles et ses outils de conception tout en accueillant des captures alignées dans une navigation commune.

Cette modification ajoute un manifeste de relevés, les chargeurs 3D Tiles et GLB, les profils mobile/desktop, la sélection des captures avec caméra commune, le retour à la maquette et un outil de recalage par points homologues. Les scans restent des ressources distinctes des scénarios et de l’export de maquette. Les dépendances optionnelles sont figées et construites localement.

**Mise à jour du 9 septembre 2026 :** cette PR, une fois fusionnée dans `main`, s'est
révélée incomplète par rapport à ce paragraphe — `web/vendor/` (le moteur Three.js de
base), `tests/`, `scripts/verify-model.mjs` et `scripts/module-loader.mjs` n'étaient pas
dans les fichiers commités, et le script de build visait `dist/vendor/surveys` au lieu de
`web/vendor/surveys`. Le site ne pouvait donc pas démarrer. Voir `docs/RECOVERY-NOTES.md`
pour le correctif et `docs/AUDIT-INTEGRATION-3D.md` pour les chiffres de test réels
(17 tests JavaScript de validation du manifeste, 15 tests Python de recalage — un
périmètre différent des tests HTTP/GLB/PNTS décrits ci-dessous, qui n'existaient pas dans
les fichiers commités et n'ont pas été reconstruits).

Validation prévue à l'origine (non exécutable telle quelle sur ce que `main` contenait
réellement — voir la mise à jour ci-dessus) : 11 tests JavaScript et 4 tests Python, compilation des bundles, contrôles de syntaxe et vérification de la géométrie existante. Les tests HTTP lisent réellement des GLB/PNTS synthétiques, vérifient le placement RTC, le raffinement LOD à l’approche et la destruction des ressources.

Les captures ATIS/Polycam réelles et la validation GPU restent à fournir. Le manifeste initial annonce les deux sources en attente. Cette préparation provient des sources disponibles du site : la stack et l’accès du dépôt GitHub demandé ne sont pas encore établis, et aucune PR GitHub n’a été créée.
