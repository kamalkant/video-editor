#!/bin/sh
# compare.sh SRC MASK FRAME OUT.png [PANEL_W] [CROP]
#   2x2 grid: original | mask / cutout over checkerboard | cutout over white.
#   MASK is any ffmpeg-readable gray video (e.g. the FFV1 .mkv written by run-mask.sh).
#   CROP (optional) "w:h:x:y" in full-res pixels -> zoomed crop instead of the whole frame.
#   SRC_OFFSET env: source frame = FRAME + SRC_OFFSET (for masks made with --start).
set -eu
OFF="${SRC_OFFSET:-0}"
SRC="$1"; MASK="$2"; N="$3"; OUT="$4"; PW="${5:-640}"; CROP="${6:-}"
# display size = mask size (source may carry a rotation matrix)
W=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nw=1:nk=1 "$MASK" | head -1)
H=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=nw=1:nk=1 "$MASK" | head -1)
PRE="null"; if [ -n "$CROP" ]; then PRE="crop=$CROP"; fi
ffmpeg -v error -y -i "$SRC" -i "$MASK" \
  -f lavfi -i "color=c=gray:s=${W}x${H},format=gray,geq=lum='if(mod(floor(X/16)+floor(Y/16)\,2)\,205\,150)'" \
  -f lavfi -i "color=c=white:s=${W}x${H}" -filter_complex "
  [0:v]select='eq(n\,$((N + OFF)))',setpts=0,format=rgba,split=3[o][c1][c2];
  [1:v]select='eq(n\,$N)',setpts=0,format=gray,split=3[m][m1][m2];
  [c1][m1]alphamerge[a1]; [c2][m2]alphamerge[a2];
  [2:v]format=rgba,trim=end_frame=1,setpts=0[chk]; [chk][a1]overlay=format=auto:shortest=1[p3];
  [3:v]format=rgba,trim=end_frame=1,setpts=0[wh]; [wh][a2]overlay=format=auto:shortest=1[p4];
  [m]format=rgba[p2];
  [o]$PRE,scale=$PW:-2:flags=lanczos,format=rgb24[q1];
  [p2]$PRE,scale=$PW:-2:flags=lanczos,format=rgb24[q2];
  [p3]$PRE,scale=$PW:-2:flags=lanczos,format=rgb24[q3];
  [p4]$PRE,scale=$PW:-2:flags=lanczos,format=rgb24[q4];
  [q1][q2]hstack[top]; [q3][q4]hstack[bot]; [top][bot]vstack" -frames:v 1 "$OUT"
