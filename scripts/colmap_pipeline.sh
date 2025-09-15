#!/usr/bin/env bash
# colmap_pipeline.sh - automate a common COLMAP pipeline for a folder of images
# Usage: ./scripts/colmap_pipeline.sh -i <images_dir> -w <workspace_dir> [-m sequential|exhaustive] [--skip-dense]

set -euo pipefail

print_usage() {
  cat <<EOF
Usage: $0 -i <images_dir> -w <workspace_dir> [-m sequential|exhaustive] [--skip-dense] [--max-image-size N]

Options:
  -i                Path to images folder
  -w                Workspace folder (will be created)
  -m                Matcher mode: sequential (default) or exhaustive
  --skip-dense      Only run sparse SfM (feature extraction, matching, mapping)
  --max-image-size  (Dense) Downscale images for MVS (default: 2200)
EOF
}

IMAGES_DIR=""
WORKSPACE=""
MATCHER="sequential"
SKIP_DENSE=0
MAX_IMAGE_SIZE=2200

# parse args
POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -i) IMAGES_DIR="$2"; shift 2;;
    -w) WORKSPACE="$2"; shift 2;;
    -m) MATCHER="$2"; shift 2;;
  --skip-dense) SKIP_DENSE=1; shift 1;;
  --max-image-size) MAX_IMAGE_SIZE="$2"; shift 2;;
    -h|--help) print_usage; exit 0;;
    --) shift; break;;
    -*|--*) echo "Unknown option $1"; print_usage; exit 1;;
    *) POSITIONAL+=("$1"); shift;;
  esac
done
# Safely restore positional parameters from POSITIONAL array.
# Some shells may treat an unset array as an error under 'set -u', so guard.
if [ "${POSITIONAL+x}" = "x" ]; then
  if [ "${#POSITIONAL[@]}" -gt 0 ]; then
    set -- "${POSITIONAL[@]}"
  else
    set --
  fi
else
  set --
fi

if [ -z "$IMAGES_DIR" ] || [ -z "$WORKSPACE" ]; then
  echo "ERROR: -i and -w are required"
  print_usage
  exit 2
fi

if ! command -v colmap >/dev/null 2>&1; then
  echo "ERROR: colmap not found in PATH. Install COLMAP first (brew/apt or download release)."
  exit 3
fi

mkdir -p "$WORKSPACE"
DB_PATH="$WORKSPACE/database.db"
SPARSE_DIR="$WORKSPACE/sparse"
DENSE_DIR="$WORKSPACE/dense"

echo "Images: $IMAGES_DIR"
echo "Workspace: $WORKSPACE"
echo "Matcher: $MATCHER"
echo "Max dense image size: $MAX_IMAGE_SIZE"

# 1) Feature extraction
echo "[1/6] Feature extraction"
colmap feature_extractor \
  --database_path "$DB_PATH" \
  --image_path "$IMAGES_DIR" \
  --SiftExtraction.use_gpu 0

# 2) Matching
echo "[2/6] Matching ($MATCHER)"
# Use conservative SIFT matcher options (CPU-only) to avoid GPU issues
SIFT_MATCH_OPTS=(--SiftMatching.use_gpu 0 --SiftMatching.max_num_matches 32768)
if [ "$MATCHER" = "exhaustive" ]; then
  colmap exhaustive_matcher --database_path "$DB_PATH" "${SIFT_MATCH_OPTS[@]}"
else
  colmap sequential_matcher --database_path "$DB_PATH" "${SIFT_MATCH_OPTS[@]}"
fi

# 3) Sparse mapper
echo "[3/6] Sparse reconstruction (mapper)"
mkdir -p "$SPARSE_DIR"
colmap mapper \
  --database_path "$DB_PATH" \
  --image_path "$IMAGES_DIR" \
  --output_path "$SPARSE_DIR" \
  --Mapper.num_threads "$(sysctl -n hw.ncpu 2>/dev/null || echo 8)" \
  --Mapper.min_model_size 50 || true

# Select best sparse model automatically (highest mean observations / image, tie-break by lowest reprojection error)
BEST_MODEL=""
BEST_SCORE=-1
if [ -d "$SPARSE_DIR" ]; then
  for d in "$SPARSE_DIR"/*; do
    [ -d "$d" ] || continue
    ANALYZER_OUT="$(colmap model_analyzer --path "$d" 2>/dev/null || true)"
    reg_images=$(echo "$ANALYZER_OUT" | awk '/Registered images:/ {print $3; exit}')
    mean_obs=$(echo "$ANALYZER_OUT" | awk '/Mean observations per image:/ {print $6; exit}')
    reproj=$(echo "$ANALYZER_OUT" | awk '/Mean reprojection error:/ {print $5; exit}' | sed 's/px//')
    # Skip if parsing failed
    if [ -z "$reg_images" ] || [ -z "$mean_obs" ] || [ -z "$reproj" ]; then
      continue
    fi
    # Score: primary = mean_obs, secondary = inverse reprojection error
    score=$(awk -v mo="$mean_obs" -v r="$reproj" 'BEGIN { if (r==0){print 0}else{printf "%.6f", mo + (1.0/r)} }')
    if awk -v s1="$score" -v s2="$BEST_SCORE" 'BEGIN { exit !(s1>s2) }'; then
      BEST_SCORE="$score"
      BEST_MODEL="$d"
    fi
  done
fi

if [ -z "$BEST_MODEL" ]; then
  echo "ERROR: Could not determine best sparse model (no models found)." >&2
  exit 4
fi

echo "Selected best sparse model: $BEST_MODEL (score $BEST_SCORE)"

if [ "$SKIP_DENSE" -eq 1 ]; then
  echo "Skipping dense reconstruction as requested. Sparse outputs are in: $SPARSE_DIR"
  exit 0
fi

# 4) Image undistorter
echo "[4/6] Image undistorter"
mkdir -p "$DENSE_DIR"
colmap image_undistorter \
  --image_path "$IMAGES_DIR" \
  --input_path "$BEST_MODEL" \
  --output_path "$DENSE_DIR" \
  --output_type COLMAP \
  --max_image_size "$MAX_IMAGE_SIZE"

# 5) Patch-match stereo
echo "[5/6] Patch-match stereo"
if ! colmap patch_match_stereo \
  --workspace_path "$DENSE_DIR" \
  --workspace_format COLMAP \
  --PatchMatchStereo.geom_consistency true \
  --PatchMatchStereo.use_gpu 0; then
  if grep -qi 'requires CUDA' "$WORKSPACE"/../*/** 2>/dev/null || true; then
    echo "WARNING: patch_match_stereo failed due to CUDA requirement in this COLMAP build. Skipping dense MVS." >&2
    echo "You can run external dense reconstruction (OpenMVS / Nerfstudio) using the sparse model at: $BEST_MODEL" >&2
    exit 0
  else
    echo "WARNING: patch_match_stereo failed. Skipping dense stage." >&2
    exit 0
  fi
fi

# 6) Stereo fusion -> fused.ply
echo "[6/6] Stereo fusion"
colmap stereo_fusion \
  --workspace_path "$DENSE_DIR" \
  --workspace_format COLMAP \
  --input_type geometric \
  --output_path "$DENSE_DIR/fused.ply" \
  --StereoFusion.min_num_pixels 5 \
  --StereoFusion.max_reproj_error 2.5

# Optional: Poisson mesher if available
if command -v colmap >/dev/null 2>&1; then
  echo "Generating poisson mesh (meshed-poisson.ply)"
  # Some colmap builds include poisson_mesher
  if colmap poisson_mesher --help >/dev/null 2>&1; then
    colmap poisson_mesher --input_path "$DENSE_DIR/fused.ply" --output_path "$DENSE_DIR/meshed-poisson.ply" || true
    if colmap delaunay_mesher --help >/dev/null 2>&1; then
      colmap delaunay_mesher --input_path "$DENSE_DIR" --output_path "$DENSE_DIR/meshed-delaunay.ply" || true
    fi
  else
    echo "poisson_mesher not available in this colmap build; skip meshing." 
  fi
fi

echo "Done. Dense outputs are located in: $DENSE_DIR"
exit 0
