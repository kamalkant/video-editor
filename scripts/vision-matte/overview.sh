#!/bin/zsh
# overview.sh SRC OUT.png COLS OFFSET MASK1 [MASK2 ...]
#   Row 1: COLS evenly spaced source frames; one extra row per mask video (same frame indices).
#   OFFSET = source frames to skip (when masks were made with --start).
set -eu
SRC=$1; OUT=$2; COLS=$3; OFF=$4; shift 4
N=$(ffprobe -v error -count_packets -select_streams v:0 -show_entries stream=nb_read_packets -of csv=p=0 "$SRC" | grep -m1 "[0-9]")
N=$((N - OFF))
STEP=$(( (N - 1) / (COLS - 1) )); [ $STEP -lt 1 ] && STEP=1
TW=$((2400 / COLS))
inputs=(-i "$SRC"); fc="[0:v]trim=start_frame=$OFF,setpts=PTS-STARTPTS,select='not(mod(n\,$STEP))',setpts=N,scale=$TW:-2,format=rgb24,tile=${COLS}x1[r0];"
i=1; rows="[r0]"
for m in "$@"; do
  inputs+=(-i "$m")
  fc+="[$i:v]select='not(mod(n\,$STEP))',setpts=N,scale=$TW:-2,format=rgb24,tile=${COLS}x1[r$i];"
  rows+="[r$i]"; i=$((i+1))
done
fc+="${rows}vstack=inputs=$i"
ffmpeg -v error -y "${inputs[@]}" -filter_complex "$fc" -frames:v 1 "$OUT"
