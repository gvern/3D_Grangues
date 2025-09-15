#!/usr/bin/env bash
## colmap_to_openmvs.sh
## One-shot pipeline:
##  1. (If needed) Run sparse reconstruction (sequential matcher)
##  2. Auto-select best sparse model (highest mean obs / image, tie by lowest reproj err)
##  3. Undistort images (controlled max size)
##  4. Convert to OpenMVS scene (InterfaceCOLMAP)
##  5. DensifyPointCloud (CPU)
##  6. ReconstructMesh (+ optional RefineMesh)
##  7. TextureMesh
##  8. Optional: export GLB if Blender or assimp is present
##
## Requirements: colmap, openmvs (InterfaceCOLMAP, DensifyPointCloud, ReconstructMesh, TextureMesh)
## Optional: blender (>=2.90) or assimp for glb export
##
## Usage example:
##   ./scripts/colmap_to_openmvs.sh \
##      -i frames_all \
##      -w colmap_ws_test \
##      -o outputs/openmvs_run1 \
##      --max-image-size 2200 \
##      --threads 8 \
##      --texture-size 4096

set -euo pipefail

print_usage() {
  cat <<EOF
Usage: $0 -i <images_dir> -w <workspace_dir> -o <output_dir> [options]

Options:
  -i                    Images directory (original frames)
  -w                    COLMAP workspace (will contain sparse/ dense/ etc.)
  -o                    Output directory (OpenMVS + exports)
  --max-image-size N    Max size for undistortion (default: 2200)
  --threads N           Max CPU threads (default: detected cores)
  --resolution-level N  OpenMVS DensifyPointCloud --resolution-level (default: 1)
  --texture-size N      Texture atlas resolution (default: 4096)
  --skip-texture        Skip texturing (still builds dense cloud + mesh)
  --refine-mesh         Run RefineMesh after ReconstructMesh
  --force-sparse        Re-run sparse even if sparse models already exist
  --skip-glb            Do not attempt GLB export
  -h|--help             Show this help

Environment detection:
  Selects best sparse model via colmap model_analyzer and scores = mean_obs + 1/reproj_err.
EOF
}

IMAGES_DIR=""
WORKSPACE=""
OUT_DIR=""
MAX_IMAGE_SIZE=2200
THREADS="$(sysctl -n hw.ncpu 2>/dev/null || echo 8)"
RES_LEVEL=1
TEX_SIZE=4096
SKIP_TEXTURE=0
REFINE=0
FORCE_SPARSE=0
SKIP_GLB=0

POSITIONAL=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    -i) IMAGES_DIR="$2"; shift 2;;
    -w) WORKSPACE="$2"; shift 2;;
    -o) OUT_DIR="$2"; shift 2;;
    --max-image-size) MAX_IMAGE_SIZE="$2"; shift 2;;
    --threads) THREADS="$2"; shift 2;;
    --resolution-level) RES_LEVEL="$2"; shift 2;;
    --texture-size) TEX_SIZE="$2"; shift 2;;
    --skip-texture) SKIP_TEXTURE=1; shift 1;;
    --refine-mesh) REFINE=1; shift 1;;
    --force-sparse) FORCE_SPARSE=1; shift 1;;
    --skip-glb) SKIP_GLB=1; shift 1;;
    -h|--help) print_usage; exit 0;;
    --) shift; break;;
    -*|--*) echo "Unknown option $1" >&2; print_usage; exit 2;;
    *) POSITIONAL+=("$1"); shift;;
  esac
done

if [[ -z "$IMAGES_DIR" || -z "$WORKSPACE" || -z "$OUT_DIR" ]]; then
  echo "ERROR: -i, -w and -o are required" >&2
  print_usage
  exit 2
fi

command -v colmap >/dev/null 2>&1 || { echo "ERROR: colmap not found" >&2; exit 3; }
command -v InterfaceCOLMAP >/dev/null 2>&1 || { echo "ERROR: InterfaceCOLMAP (OpenMVS) not found. Install openmvs (brew install openmvs)." >&2; exit 3; }

mkdir -p "$WORKSPACE" "$OUT_DIR"
DB_PATH="$WORKSPACE/database.db"
SPARSE_DIR="$WORKSPACE/sparse"
DENSE_DIR="$WORKSPACE/dense"
OPENMVS_DIR="$OUT_DIR/openmvs"
mkdir -p "$OPENMVS_DIR"

echo "=== CONFIG ==="
echo "Images          : $IMAGES_DIR"
echo "Workspace       : $WORKSPACE"
echo "Output          : $OUT_DIR"
echo "Threads         : $THREADS"
echo "Max image size  : $MAX_IMAGE_SIZE"
echo "Resolution lvl  : $RES_LEVEL"
echo "Texture size    : $TEX_SIZE"
echo "Refine mesh     : $REFINE"
echo "Skip texture    : $SKIP_TEXTURE"
echo "Skip glb export : $SKIP_GLB"

run_sparse_if_needed() {
  local need=0
  if [[ $FORCE_SPARSE -eq 1 ]]; then
    need=1
  elif [[ ! -d "$SPARSE_DIR" ]] || ! ls -1 "$SPARSE_DIR" 2>/dev/null | grep -q '.'; then
    need=1
  fi
  if [[ $need -eq 0 ]]; then
    echo "[Sparse] Existing sparse models found; skipping reconstruction (use --force-sparse to rebuild)."
    return
  fi
  echo "[Sparse] Running feature extraction + sequential matcher + mapper"
  rm -f "$DB_PATH"
  mkdir -p "$SPARSE_DIR"
  colmap feature_extractor --database_path "$DB_PATH" --image_path "$IMAGES_DIR" --SiftExtraction.use_gpu 0
  colmap sequential_matcher --database_path "$DB_PATH" --SiftMatching.use_gpu 0 --SiftMatching.max_num_matches 32768
  colmap mapper --database_path "$DB_PATH" --image_path "$IMAGES_DIR" --output_path "$SPARSE_DIR" --Mapper.min_model_size 50 || true
}

select_best_sparse() {
  local best=""; local best_score=-1
  for d in "$SPARSE_DIR"/*; do
    [[ -d "$d" ]] || continue
    local out="$(colmap model_analyzer --path "$d" 2>/dev/null || true)"
    local mean_obs reproj
    mean_obs=$(echo "$out" | awk '/Mean observations per image:/ {print $6; exit}')
    reproj=$(echo "$out" | awk '/Mean reprojection error:/ {print $5; exit}' | sed 's/px//')
    if [[ -z "$mean_obs" || -z "$reproj" ]]; then continue; fi
    local score
    score=$(awk -v mo="$mean_obs" -v r="$reproj" 'BEGIN{ if(r==0){print 0}else printf "%.6f", mo + (1.0/r); }')
    if awk -v s1="$score" -v s2="$best_score" 'BEGIN{exit !(s1>s2)}'; then
      best_score="$score"; best="$d"
    fi
  done
  if [[ -z "$best" ]]; then
    echo "ERROR: No sparse models found in $SPARSE_DIR" >&2
    exit 4
  fi
  echo "$best|$best_score"
}

run_sparse_if_needed

BEST_LINE=$(select_best_sparse)
BEST_MODEL=${BEST_LINE%|*}
BEST_SCORE=${BEST_LINE#*|}
echo "[Select] Best sparse model: $BEST_MODEL (score $BEST_SCORE)"

echo "[Undistort] -> $DENSE_DIR"
rm -rf "$DENSE_DIR" && mkdir -p "$DENSE_DIR"
colmap image_undistorter \
  --image_path "$IMAGES_DIR" \
  --input_path "$BEST_MODEL" \
  --output_path "$DENSE_DIR" \
  --output_type COLMAP \
  --max_image_size "$MAX_IMAGE_SIZE"

echo "[InterfaceCOLMAP] Converting to OpenMVS"
InterfaceCOLMAP \
  --input_path "$DENSE_DIR" \
  --output_file "$OPENMVS_DIR/scene.mvs"

echo "[DensifyPointCloud]"
DensifyPointCloud "$OPENMVS_DIR/scene.mvs" \
  --resolution-level "$RES_LEVEL" \
  --number-views 6 \
  --min-resolution 640 \
  --max-resolution 6000 \
  --max-threads "$THREADS" \
  -w "$OPENMVS_DIR"

SCENE_DENSE="$OPENMVS_DIR/scene_dense.mvs"
if [[ ! -f "$SCENE_DENSE" ]]; then
  # Some versions produce scene_dense.mvs automatically; else fallback to last .mvs
  SCENE_DENSE=$(ls -1t "$OPENMVS_DIR"/*.mvs | head -n1)
fi

echo "[ReconstructMesh]"
ReconstructMesh "$SCENE_DENSE" \
  --mesh-file "$OPENMVS_DIR/mesh_dense.ply" \
  --smooth 3 \
  --max-threads "$THREADS" \
  -w "$OPENMVS_DIR"

if [[ $REFINE -eq 1 ]]; then
  echo "[RefineMesh]"
  RefineMesh "$OPENMVS_DIR/mesh_dense.ply" \
    --resolution-level "$RES_LEVEL" \
    --max-threads "$THREADS" \
    -w "$OPENMVS_DIR" || echo "[RefineMesh] skipped (failure)"
fi

if [[ $SKIP_TEXTURE -eq 0 ]]; then
  echo "[TextureMesh]"
  TextureMesh "$OPENMVS_DIR/mesh_dense.ply" \
    --export-type obj \
    --texture-size "$TEX_SIZE" \
    --patch-packing-heuristic 2 \
    --max-threads "$THREADS" \
    -w "$OPENMVS_DIR" \
    -o "$OPENMVS_DIR/mesh_textured.obj"
else
  echo "[TextureMesh] skipped (--skip-texture)"
fi

if [[ $SKIP_GLB -eq 0 && -f "$OPENMVS_DIR/mesh_textured.obj" ]]; then
  echo "[GLB] Attempt export"
  if command -v blender >/dev/null 2>&1; then
    TMP_PY=$(mktemp /tmp/blender_glb_XXXX.py)
    cat > "$TMP_PY" <<'PY'
import bpy, sys, os
argv = sys.argv
obj_path = argv[argv.index('--')+1]
glb_path = argv[argv.index('--')+2]
for o in bpy.context.scene.objects:
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.obj(filepath=obj_path)
bpy.ops.export_scene.gltf(filepath=glb_path, export_format='GLB', export_apply=True)
PY
    blender -b -noaudio --python "$TMP_PY" -- "$OPENMVS_DIR/mesh_textured.obj" "$OPENMVS_DIR/mesh_textured.glb" >/dev/null 2>&1 || echo "[GLB] Blender export failed"
    rm -f "$TMP_PY"
  elif command -v assimp >/dev/null 2>&1; then
    assimp export "$OPENMVS_DIR/mesh_textured.obj" "$OPENMVS_DIR/mesh_textured.glb" || echo "[GLB] assimp export failed"
  else
    echo "[GLB] Skipped (no blender or assimp found)"
  fi
fi

echo "=== DONE ==="
ls -lh "$OPENMVS_DIR" | sed -n '1,60p'
echo "Artifacts in: $OPENMVS_DIR"
echo "Best sparse model: $BEST_MODEL"

exit 0
