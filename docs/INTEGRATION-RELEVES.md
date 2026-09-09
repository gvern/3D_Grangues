# Intégration des relevés dans les sources du site

Cette branche est un prototype vérifié par tests CPU, préparé depuis le code disponible du site, base `7d0b92e`. L’accès à `gvern/3D_Grangues` reste nécessaire pour y comparer les sources et appliquer les changements adaptés à sa stack réelle. Aucun relevé réel n’est inclus et aucune publication de cette extension n’a été effectuée.

## Fichiers et responsabilités

| Fichier | Responsabilité |
|---|---|
| `dist/assets/surveys.json` | Configuration initiale ; drone et Polycam en attente |
| `dist/surveys/manifest.js` | Repère, validation, matrices, URLs et profils |
| `dist/surveys/loaders.js` | GLB borné, streaming de tuiles, décodeurs et destruction des ressources |
| `dist/surveys/session.js` | Sélection, annulation, erreurs, capture active unique |
| `dist/surveys/controller.js` | Caméra existante, UI, mémorisation des vues et visibilité des groupes |
| `scripts/align-survey.py` | Transformation par points homologues et rapport de résidus |
| `scripts/build-survey-vendor.mjs` | Reconstruction reproductible des dépendances optionnelles |
| `tests/` | Repère, recalage, chargements, raffinement LOD et cycle de vie |

Les modifications de `app.js` se limitent au montage du contrôleur, à sa mise à jour dans la boucle de rendu, aux règles de navigation et à la restitution de la maquette pour les outils de conception. `scene.js`, les parcelles, les façades et les scénarios existants sont réutilisés.

## Construire et vérifier

Node.js 22 ou plus récent convient au script de construction et aux tests. Python 3 avec NumPy est nécessaire uniquement pour l’alignement et ses tests.

```sh
npm ci --legacy-peer-deps
npm run build
npm test
python3 -m pip install numpy
npm run test:alignment
npm run verify:model
python3 -m http.server 8000 --directory dist
```

Le mode statique peut utiliser directement les fichiers `dist` conservés dans Git. Il ne nécessite aucun CDN JavaScript tiers. `--legacy-peer-deps` évite l’installation des intégrations React/Babylon non utilisées par 3d-tiles-renderer. Le lockfile fige la résolution npm.

Le constructeur vérifie la compatibilité du repère de la maquette avec celui des scans. Si l’origine ou le niveau de référence change, les anciens alignements doivent être migrés explicitement.

## Préparer l’extérieur

1. Conserver l’original E57/LAS/LAZ, son système de coordonnées, ses unités, ses couleurs et le rapport du relevé. Calculer un SHA-256 pour identifier la livraison.
2. Contrôler l’emprise : un survol autour du château peut ne pas couvrir les 19 parcelles. Relever les trous et zones masquées ; conserver le terrain indicatif où aucune capture n’existe.
3. Vérifier ou reprojeter vers EPSG:2154 avec un outil géospatial adapté. Traiter séparément la référence verticale. Ne jamais déduire le CRS du seul nom du fichier ou de l’adresse.
4. Décaler les coordonnées avant quantification/Float32. La cible web peut employer directement les axes locaux du projet, ou un repère local de scan en mètres relié par `sourceToWorld`. Les transformations internes du tileset, y compris RTC, doivent être prises en compte une seule fois.
5. Construire une hiérarchie 3D Tiles avec racine grossière, volumes englobants et `geometricError` cohérents. [py3dtiles](https://py3dtiles.org/) est une option de conversion ouverte ; sa [CLI](https://py3dtiles.org/v12.1.1/cli.html) documente `py3dtiles convert scan.las --out destination`. Cet appel ne remplace pas les contrôles du repère et du décalage. La chaîne de conversion complète n’a pas été exécutée sur les données du domaine.
6. Tester une petite zone avant le domaine entier. Pour ce prototype, utiliser des boîtes ou sphères dans le repère local ; les volumes `region` en coordonnées géographiques/ECEF demandent une adaptation géodésique supplémentaire.

Le chargeur cible 3D Tiles 1.0/PNTS et les maillages glTF compatibles. Les extensions 1.1, implicit tiling, formats propriétaires ATIS et COPC direct ne sont pas validés. Préserver COPC/E57/LAZ comme originaux ou dérivés de travail n’implique pas leur chargement direct dans cette version.

## Préparer Polycam

Exporter un maillage GLB texturé. Découper par étage ou pièce si nécessaire, sans recentrer chaque export indépendamment. Tous les niveaux de détail d’un même scan doivent conserver la même origine, les mêmes axes et la même échelle. Préparer des fichiers autonomes contenant leurs buffers et images ; les ressources GLB externes sont refusées pour que la taille de chargement reste contrôlable.

Préparer une variante `mobile` et, si utile, une variante `desktop`. Réduire géométrie et textures hors navigateur, puis vérifier l’export dans un lecteur glTF. Les chargeurs embarquent les adaptateurs Draco, Meshopt et KTX2 ainsi que les décodeurs locaux. Leur rendu compressé doit encore être essayé sur les appareils cibles.

Un GLB constitue une unité de chargement complète. Le prototype sélectionne un LOD par profil et un étage par source ; il ne raffine pas automatiquement un grand GLB pièce par pièce. Pour cela, subdiviser davantage ou préparer un tileset maillé, puis valider cette variante. Les plans ou maillages destinés aux collisions restent des données distinctes à préparer.

## Recalage reproductible

Le fichier de points pour `align-survey.py` déclare `targetSpace` (`EPSG:2154-ENH` ou `project-local`), `verticalDatumVerified`, et une liste `points`. Chaque point a un `id`, un `kind` (`control` ou `check`), `source: [x,y,z]` et `target: [a,b,c]`.

Les coordonnées source sont déjà locales et métriques. Fournir au moins trois points d’ajustement non alignés ; préférer cinq à sept points répartis dans l’emprise et en hauteur. Deux points indépendants au minimum sont nécessaires au statut contrôlé calculé par le script. Des points de part et d’autre d’ouvertures ou du hall peuvent relier relevés extérieurs et intérieurs s’ils sont réellement mesurés et identifiables dans les deux captures.

```sh
python3 scripts/align-survey.py points-reels.json --out alignment.json
```

Ajouter `--allow-scale` seulement après examen des unités et de la dérive du scan. `--max-fit-rms` et `--max-check-error` adaptent les critères de travail au protocole retenu. Une mauvaise série de points ne devient pas correcte par un ajustement ICP visuellement convaincant.

Le résultat inclut `sourceToWorld`, une matrice 4×4 **rangée par colonnes**, à appliquer à un vecteur colonne : `pWorld = M × pSource`. La translation occupe les indices 12, 13, 14. L’alignement produit une rotation propre, sans miroir, et une échelle uniforme. `registration.status` reste `unverified` si les résidus, les points indépendants ou le rattachement vertical ne satisfont pas les critères. Les résidus ne mesurent pas l’exactitude absolue du relevé.

## Contrat du manifeste

La configuration complète porte `schemaVersion: 1`, `siteId: domaine-grangues-3d` et `referenceFrame` identique au fichier initial. Chaque source prête fournit :

| Champ | Valeur attendue |
|---|---|
| `id`, `label` | Identifiant stable unique et nom lisible |
| `role` | `exterior` ou `interior` |
| `availability` | `ready` seulement lorsque les fichiers existent ; sinon `pending` sans variantes |
| `format` | `3d-tiles` ou `glb` |
| `coordinateSpace` | `local-meters` ; coordonnées déjà préparées hors navigateur |
| `sourceToWorld` | Matrice provenant du recalage ou d’une conversion géographique contrôlée |
| `registration` | Statut `checked` ou `unverified`, conserver le rapport et sa provenance |
| `floorId` | Requis pour un intérieur ; identifiant d’étage ou de zone |
| `entry.position`, `entry.target` | Point de vue en XYZ locaux du **projet**, après application de l’alignement |
| `replaces` | Liste explicite parmi `castle`, `terrain`, `trees`, `outbuildings`, `ancillary`, `pond` |
| `variants` | Une ou deux entrées : `quality`, `uri`, et `byteSize` obligatoire pour GLB |
| `provenance` | Fournisseur, date, original, hash, méthode et limites de couverture, selon informations reçues |

`castle` comprend aussi ses aménagements enfants, dont les buis et terrasses. Ne le masquer que si la capture fournit une couverture suffisante. Les réglages de visibilité sont restaurés au retour. Le scénario de travaux et les limites cadastrales restent séparés des relevés.

Les URLs relatives du fichier initial sont résolues depuis `assets/surveys.json`. Pour une configuration importée par l’utilisateur, elles sont résolues depuis la page du site : préférer des URLs HTTPS absolues vers des dérivés versionnés. La taille du GLB reçu doit correspondre à `byteSize`. L’import du manifeste est local à la session ; il ne publie pas de fichiers et ne modifie pas le serveur.

## Budgets de départ et comportement en erreur

| Paramètre | Économe | Détaillé |
|---|---:|---:|
| Cible d’erreur écran des tuiles | 12 pixels | 6 pixels |
| Cache estimé des tuiles | 128 Mio | 256 Mio |
| Nombre maximal d’éléments du cache | 256 | 512 |
| Téléchargements par origine | 2 | 4 |
| Tâches de parsing / workers par décodeur | 1 | 2 |
| Taille maximale d’un GLB transféré | 32 Mio | 96 Mio |
| Pixel ratio | 1 | 1,6 |

Ce sont des réglages initiaux, pas des résultats de benchmark. Le cache est une estimation de la bibliothèque avec éviction ; ce n’est pas un plafond garanti de mémoire GPU globale. La maquette de fond reste en mémoire. Les textures décompressées et les données transitoires de parsing peuvent coûter davantage que le fichier transféré. Prévoir des tuiles petites, des textures adaptées et un budget total mesuré.

Une seule capture est active à la fois. Les chargements précédents sont annulés, les résultats tardifs sont détruits, les géométries et textures libérées et les workers terminés au déchargement. Les erreurs HTTP/CORS ou de parsing rétablissent la maquette. Une absence de première tuile après 45 secondes signale un problème de fichiers, de cadrage ou de réseau. Le rendu est déjà suspendu lorsque l’onglet est masqué.

Sur mobiles sans information mémoire fiable, le profil économe est retenu. Une source disponible uniquement en qualité détaillée n’est pas chargée silencieusement en mode économe. Pour les intérieurs, prévoir une variante mobile même si le desktop accepte le fichier complet.

La version 0.5.2 de 3d-tiles-renderer exige `maxJobsPerOrigin` pour sa file de téléchargement. L’adaptateur contourne aussi son ajout d’un double slash lorsque le tileset est hébergé à la racine ; cette situation est couverte par le test HTTP. Les décodeurs sont détruits explicitement car l’option `autoDispose` du plugin n’est pas affectée à l’instance dans cette version.

## Hébergement des données et raccordement au dépôt demandé

Conserver les relevés bruts hors Git. Préférer un stockage objet avec chemins de versions immuables et manifeste court. Servir les dérivés sous le même périmètre d’accès que le site, soit par une route authentifiée de même origine, soit par un stockage privé avec autorisation adaptée aux sous-fichiers. Une URL signée pour `tileset.json` seule ne donne pas automatiquement accès aux tuiles et textures.

Si les données sont servies sur une autre origine, configurer CORS pour le site et ses méthodes de lecture. Ne pas mettre de clés permanentes dans JavaScript. Prévoir les types MIME JSON, glTF, WASM et binaires appropriés ; activer la compression HTTP des JSON/JS et un cache long sur les chemins immuables. Les formats qui lisent par plages demandent aussi HTTP Range et l’exposition des en-têtes correspondants ; PNTS par fichier ne dépend pas d’un COPC Range reader dans ce prototype.

Lorsque GitHub est accessible, comparer son arbre et ses instructions de contribution aux sources du site. S’il contient cette base, appliquer le patch sur une branche et résoudre les éventuels décalages de `app.js`/HTML. Si sa stack diffère, conserver le contrat et les adaptateurs et raccorder `mountSurveys` à son renderer, sa scène, sa caméra et son cycle de destruction. Ne pas écraser ce dépôt avec les sources du site sans cette comparaison. L’identité de projet Sites dans `.openai/hosting.json` doit rester liée au site existant.

La revue doit inclure : lecture réelle d’un extrait drone et d’un étage, contrôle des points indépendants, cour nord/terrasse sud/buis ouest/parking est, retour aux scénarios, parcours sur appareils cibles et vérification des accès aux fichiers. Déploiement après cette revue ; aucune migration backend n’est nécessaire pour la configuration statique seule.
