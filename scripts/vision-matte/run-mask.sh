#!/bin/sh
# run-mask.sh SRC OUT.mkv [vision-matte options...]
#   Pipes vision-matte into ffmpeg and stores the masks as a lossless FFV1 gray video
#   (the per-video mask cache format proposed for VDO). Frame rate = the source's real rate.
set -eu
VM="${VM:-$(dirname "$0")/vision-matte}"
SRC="$1"; OUT="$2"; shift 2
P=$("$VM" "$SRC" --probe)
W=$(echo "$P" | sed -E 's/.*"width":([0-9]+).*/\1/')
H=$(echo "$P" | sed -E 's/.*"height":([0-9]+).*/\1/')
FPS=$(echo "$P" | sed -E 's/.*"fpsRational":"([0-9./]+)".*/\1/')   # real frame rate, not avg_frame_rate
"$VM" "$SRC" "$@" | ffmpeg -v error -y -f rawvideo -pix_fmt gray -s "${W}x${H}" -r "$FPS" -i pipe:0 \
  -c:v ffv1 -level 3 -g 1 -slices 4 "$OUT"
