#!/bin/sh
# tile8.sh SRC MASK FIRST_FRAME OUT.png [TILE_W]
#   Two rows: 8 consecutive source frames, and the same 8 mask frames (flicker check).
set -eu
SRC="$1"; MASK="$2"; F="$3"; OUT="$4"; TW="${5:-320}"
ffmpeg -v error -y -i "$SRC" -i "$MASK" -filter_complex "
  [0:v]select='between(n\,$F\,$F+7)',setpts=N,scale=$TW:-2,format=rgb24,tile=8x1[a];
  [1:v]select='between(n\,$F\,$F+7)',setpts=N,scale=$TW:-2,format=rgb24,tile=8x1[b];
  [a][b]vstack" -frames:v 1 "$OUT"
