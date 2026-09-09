# 3D_Grangues
Modélisation 3D de Grangues

## Structure du dépôt

```
web/                     maquette 3D (viewer Three.js) + la couche relevés 3D
                          (nuage extérieur ATIS, futurs étages Polycam) — voir web/README.md
scripts/pointcloud.../    scripts d'intégration des relevés — voir scripts/align-survey.py,
                          scripts/build-survey-vendor.mjs
scripts/*.sh              pipeline photogrammétrie vidéo -> COLMAP (ci-dessous, inchangé)
tests/                     tests automatisés (node --test / unittest — voir docs/INTEGRATION-RELEVES.md)
docs/
  AUDIT-INTEGRATION-3D.md   audit du site déployé et du nuage de points ATIS
  INTEGRATION-RELEVES.md    contrat des données, budgets, fichiers ajoutés
  RECEPTION-RELEVES.md      exports et informations à obtenir (ATIS, Polycam)
  RECOVERY-NOTES.md         ce qui a été trouvé cassé après fusion et corrigé (9 sept. 2026)
```

Pour lancer le site en local et reproduire les vérifications automatisées :
voir `docs/INTEGRATION-RELEVES.md` (§ « Construire et vérifier ») ou `docs/RECOVERY-NOTES.md`.

## Extract frames from videos (FFmpeg)

Most photogrammetry tools work with images, not raw video. Use FFmpeg to extract frames at a regular interval, then feed those images to your photogrammetry software (Metashape, Meshroom, COLMAP, RealityCapture, etc.).

Basic example (extract 2 frames per second):

```bash
ffmpeg -i Videos/house_video.mp4 -vf "fps=2" frames/house_video/frame_%04d.jpg
```

This saves JPG frames into `frames/<video_name>/` at 2 fps. Increase `fps` for more overlap (and more images), or decrease it if you have many redundant frames.

I've included a small reusable script to extract frames from every video in the `Videos/` folder. It creates a `frames/` directory with one subfolder per video.

Usage:

```bash
# make the script executable once
chmod +x scripts/extract_frames.sh

# run with default 2 fps
./scripts/extract_frames.sh

# or specify fps, for example 3 fps
./scripts/extract_frames.sh -f 3
```

Photogrammetry tips:
- Aim for good overlap between consecutive frames (20–60% or more). If motion is slow, 1–3 fps is often enough; for faster motion or close-range passes use higher fps.
- Use the highest reasonable resolution your software can handle. If you have many images, you can downscale later.
- Avoid rolling shutter blur and frames with motion blur; use steady camera paths when filming.
- Remove near-duplicate frames to reduce processing time.

Next steps: after extracting frames, choose a photogrammetry pipeline (Meshroom/COLMAP/Metashape) and import the images. If you want, I can add a small guide for running Meshroom or COLMAP on the extracted frames.

### Guide pas à pas : COLMAP (FR)

Parfait 👍 Colmap est une super base, très puissant et open-source — mais un peu plus technique que Meshroom. Voici un tutoriel pas à pas pour transformer tes vidéos en modèle 3D avec **COLMAP** (CLI + GUI options).

### 1. Installation

- Mac : `brew install colmap`
- Linux (Ubuntu) :

```bash
sudo apt update
sudo apt install colmap
```

- Windows : télécharge la release sur https://github.com/colmap/colmap/releases

### 2. Extraire des images depuis tes vidéos

COLMAP ne lit pas directement les vidéos, il faut extraire des frames. Exemple :

```bash
mkdir -p frames
ffmpeg -i house_video.mp4 -vf "fps=2" frames/frame_%04d.jpg
```

Ici on prend 2 images par seconde. Ajuste `fps=1` pour longues vidéos ou `fps=5` pour plus de détails.

Le dépôt contient `scripts/extract_frames.sh` qui extrait toutes les vidéos de `Videos/` vers `frames/<video_basename>/`.

### 3. Lancer COLMAP (GUI ou CLI)

Option A — GUI (facile pour débuter) :

1. Ouvre COLMAP → File > New Project
2. Database path : `database.db`
3. Image path : dossier `frames/` ou `frames/<video>/`
4. Workspace path : un dossier vide pour stocker le projet
5. Sauvegarde → ça crée `database.db` et `workspace/`

Option B — CLI (automatisable) :

J'ai ajouté un script CLI `scripts/colmap_pipeline.sh` qui automatise un pipeline typique (extraction de features, matching, reconstruction sparse, dense, fusion, et maillage). Voir la section « Try it » ci-dessous.

### 4. Pipeline reconstruction (sparse)

Étape 1 — Feature extraction :

```bash
colmap feature_extractor --database_path $WORKSPACE/database.db --image_path frames/<video>
```

Étape 2 — Feature matching :

```bash
# exhaustive (pour datasets non ordonnés)
colmap exhaustive_matcher --database_path $WORKSPACE/database.db

# ou séquentiel (si les images sont consécutives dans la vidéo)
colmap sequential_matcher --database_path $WORKSPACE/database.db
```

Étape 3 — Reconstruction Sparse (Structure-from-Motion) :

```bash
colmap mapper --database_path $WORKSPACE/database.db --image_path frames/<video> --output_path $WORKSPACE/sparse
```

Colmap va estimer les caméras et créer un nuage de points clairsemé.

### 5. Dense Reconstruction

```bash
colmap image_undistorter \
	--image_path frames/<video> \
	--input_path $WORKSPACE/sparse/0 \
	--output_path $WORKSPACE/dense \
	--output_type COLMAP

colmap patch_match_stereo \
	--workspace_path $WORKSPACE/dense \
	--workspace_format COLMAP \
	--PatchMatchStereo.geom_consistency true

colmap stereo_fusion \
	--workspace_path $WORKSPACE/dense \
	--workspace_format COLMAP \
	--input_type geometric \
	--output_path $WORKSPACE/dense/fused.ply
```

Le fichier `fused.ply` est ton nuage dense.

### 6. Créer le Mesh et Texturer

```bash
colmap poisson_mesher \
	--input_path $WORKSPACE/dense/fused.ply \
	--output_path $WORKSPACE/dense/meshed-poisson.ply
```

Ensuite, ouvre `meshed-poisson.ply` dans Meshlab ou Blender pour nettoyer et texturer.

### 7. Visualisation et nettoyage

- Ouvre le PLY dans Meshlab/Blender
- Supprime le sol, le ciel et les artefacts
- Re-centre et scale si nécessaire

### 8. Exporter

- Formats : `.ply`, `.obj`, `.glb`
- Import possible vers Blender, Unity, Unreal, Sketchfab

---

## Try it — script automatique COLMAP

Un script `scripts/colmap_pipeline.sh` a été ajouté pour automatiser le pipeline COLMAP en ligne de commande. Il prend en entrée un dossier d'images et un dossier workspace, et exécute : extraction de features, matching (exhaustive ou sequential), mapping sparse, undistort, patch-match, fusion, et poisson meshing.

Usage rapide :

```bash
# rendre exécutable
chmod +x scripts/colmap_pipeline.sh

# exécuter pour un dossier d'images
./scripts/colmap_pipeline.sh -i frames/IMG_9128 -w workspace/IMG_9128 -m sequential
```

Le script vérifie la présence de la commande `colmap` et arrête si elle est absente. Il expose aussi des options pour ignorer la partie dense/meshing si besoin.

---

Si tu veux, j'ajoute aussi :
- un petit script Python pour filtrer/deduper les images (par similarité) avant COLMAP
- un notebook pour visualiser rapidement les PLYs

```

