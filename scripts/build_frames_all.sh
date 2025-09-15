#!/usr/bin/env bash
# build_frames_all.sh - flatten all extracted frame subfolders into frames_all/ for COLMAP (non-recursive image loading)
# Usage: ./scripts/build_frames_all.sh [-s STEP]
#   -s STEP   Keep 1 of every STEP frames (default 1 = keep all)
# Produces unique filenames: <subfolder>_<originalname>.jpg

set -euo pipefail

STEP=1
FRAMES_ROOT="$(dirname "$0")/../frames"
TARGET_DIR="$(dirname "$0")/../frames_all"

while getopts ":s:" opt; do
  case ${opt} in
    s) STEP=${OPTARG} ;;
    \?) echo "Usage: $0 [-s step]"; exit 1 ;;
  esac
done

if ! [[ $STEP =~ ^[0-9]+$ ]] || [ "$STEP" -lt 1 ]; then
  echo "STEP must be a positive integer" >&2
  exit 2
fi

mkdir -p "$TARGET_DIR"

echo "Flattening frames from $FRAMES_ROOT into $TARGET_DIR (step=$STEP)"
TOTAL_SRC=0
TOTAL_KEPT=0
for dir in "$FRAMES_ROOT"/*/; do
  [ -d "$dir" ] || continue
  base=$(basename "$dir")
  idx=0
  # Use LC_ALL=C for predictable sort order
  while IFS= read -r -d '' f; do
    TOTAL_SRC=$((TOTAL_SRC+1))
    idx=$((idx+1))
    if (( (idx-1) % STEP != 0 )); then
      continue
    fi
    bn=$(basename "$f")
    out="$TARGET_DIR/${base}_${bn}"
    # Copy (not symlink) to avoid symlink traversal issues and ensure stability
    if [ ! -f "$out" ]; then
      cp "$f" "$out"
      TOTAL_KEPT=$((TOTAL_KEPT+1))
    fi
  done < <(find "$dir" -maxdepth 1 -type f -iname '*.jpg' -print0 | sort -z)
  echo "  Processed $dir"
done

echo "Done. Source frames: $TOTAL_SRC  Kept: $TOTAL_KEPT  (step=$STEP)"
exit 0
