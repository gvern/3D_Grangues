# Préparation : intégrer les relevés extérieurs et intérieurs

La maquette actuelle ne sait charger ni le nuage drone ni les futurs intérieurs. Elle doit conserver ses parcelles et ses outils de conception tout en accueillant des captures alignées dans une navigation commune.

Cette modification ajoute un manifeste de relevés, les chargeurs 3D Tiles et GLB, les profils mobile/desktop, la sélection des captures avec caméra commune, le retour à la maquette et un outil de recalage par points homologues. Les scans restent des ressources distinctes des scénarios et de l’export de maquette. Les dépendances optionnelles sont figées et construites localement.

Validation : 11 tests JavaScript et 4 tests Python, compilation des bundles, contrôles de syntaxe et vérification de la géométrie existante. Les tests HTTP lisent réellement des GLB/PNTS synthétiques, vérifient le placement RTC, le raffinement LOD à l’approche et la destruction des ressources.

Les captures ATIS/Polycam réelles et la validation GPU restent à fournir. Le manifeste initial annonce les deux sources en attente. Cette préparation provient des sources disponibles du site : la stack et l’accès du dépôt GitHub demandé ne sont pas encore établis, et aucune PR GitHub n’a été créée.
