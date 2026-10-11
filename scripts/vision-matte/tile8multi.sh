#!/bin/zsh
# tile8multi.sh SRC FIRST OUT.png TILE_W MASK1 [MASK2 ...]
#   Row 1: 8 consecutive source frames from FIRST; then one row per mask (same frames).
set -eu
SRC=$1; F=$2; OUT=$3; TW=$4; shift 4
inputs=(-i "$SRC"); fc="[0:v]select='between(n\,$F\,$F+7)',setpts=N,scale=$TW:-2,format=rgb24,tile=8x1[r0];"
i=1; rows="[r0]"
for m in "$@"; do
  inputs+=(-i "$m")
  fc+="[$i:v]select='between(n\,$F\,$F+7)',setpts=N,scale=$TW:-2,format=rgb24,tile=8x1[r$i];"
  rows+="[r$i]"; i=$((i+1))
done
fc+="${rows}vstack=inputs=$i"
ffmpeg -v error -y "${inputs[@]}" -filter_complex "$fc" -frames:v 1 "$OUT"
