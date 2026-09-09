# Données à réunir pour le domaine de Grangues

## Pour reprendre le dépôt GitHub

Rendre `gvern/3D_Grangues` accessible à la connexion GitHub utilisée ici, ou fournir une archive de sa branche de travail. L’audit a trouvé un compte connecté `gvern`, mais le dépôt renvoie 404. Il reste à établir sa stack et sa relation avec les sources du site. Le code préparé est dans `feat/unified-surveys` des sources du site.

## Extérieur ATIS

Obtenir le fichier original colorisé, de préférence E57 ou LAS, accompagné de sa projection, de ses unités, de son niveau de référence vertical, de sa date et du rapport de contrôle disponible. Un original LAZ convient aussi. Demander le nombre de points, l’emprise et les éventuels décalages d’origine appliqués par le logiciel.

Un accès de visualisation partagé ne confirme pas le droit de télécharger. Dans ATIS, les permissions **Download data** et **Export data** sont distinctes. La documentation indique LAS/CSV pour un export de zone par navigateur, et LAS/E57/RCP pour un export serveur. Les formats réellement disponibles sur ce projet et les droits du partage n’ont pas pu être vérifiés à cause de l’erreur WebGL 2 du navigateur d’audit.

Commencer par un extrait autour du château et une vue du nuage avec ses propriétés. Puis obtenir la couverture du domaine ou un plan des zones réellement survolées. Les 19 parcelles demandées ne sont pas nécessairement toutes couvertes par ce relevé ; la maquette géographique sert de contexte pour les zones absentes.

## Futurs intérieurs Polycam

Fournir le GLB texturé de chaque étage ou zone, les noms des pièces/étages, les unités et les exports originaux conservés. Prévoir des observations communes entre étages et autour des ouvertures reliant extérieur et intérieur. Éviter un recentrage indépendant des fichiers sans conserver les transformations.

Si une capture Gaussian Splat est réalisée, fournir son PLY séparément avec le maillage disponible. Le prototype charge les GLB ; l’adaptateur de splats reste une extension future.

## Points de raccordement

Relever idéalement cinq à sept points homologues répartis dans l’espace, et au moins deux points supplémentaires réservés au contrôle indépendant. Pour chaque point : identifiant, description permettant de le retrouver, coordonnées dans le scan, coordonnées cibles et méthode de mesure. Vérifier le rattachement vertical et l’échelle avant de déclarer le recalage contrôlé.

Les orientations confirmées restent : cour anglaise au nord, terrasse au sud, buis ouest vers le miroir d’eau et les dépendances, grand escalier et parking à l’est. L’emplacement exact des points doit être mesuré ; les surfaces reconstituées d’après photos ne sont pas des références de précision.

Aucun message n’a été envoyé à un tiers pour demander ces éléments.
