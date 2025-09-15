#!/usr/bin/env bash
# extract_frames.sh - extract frames from all videos in Videos/ into frames/<video_basename>/
# usage: ./scripts/extract_frames.sh [-f FPS]

set -euo pipefail

FPS=2
VIDEOS_DIR="$(dirname "$0")/../Videos"
FRAMES_DIR="$(dirname "$0")/../frames"

while getopts ":f:" opt; do
  case ${opt} in
    f ) FPS=${OPTARG} ;;
    \? ) echo "Usage: $0 [-f fps]"; exit 1 ;;
  esac
done

mkdir -p "$FRAMES_DIR"

shopt -s nullglob
for vid in "$VIDEOS_DIR"/*.{mp4,MP4,mov,MOV,mkv,MKV,avi,AVI}; do
  [ -e "$vid" ] || continue
  base=$(basename "$vid")
  name="${base%.*}"
  outdir="$FRAMES_DIR/$name"
  mkdir -p "$outdir"
  echo "Extracting frames from $vid -> $outdir at ${FPS} fps"
  ffmpeg -hide_banner -loglevel error -i "$vid" -vf "fps=${FPS}" "$outdir/frame_%04d.jpg"
done

echo "Done. Frames saved in $FRAMES_DIR"
