#!/bin/zsh
# cutouts.sh SRC FRAME CROP OUT.png BG MASK1 [MASK2 ...]
#   One row: the cutout of FRAME over BG (white|checker|black) for each mask, cropped to CROP (w:h:x:y),
#   scaled 2x with nearest neighbour so edges can be inspected.
set -eu
SRC=$1; N=$2; CROP=$3; OUT=$4; BG=$5; shift 5
W=$(ffprobe -v error -select_streams v:0 -show_entries stream=width -of default=nw=1:nk=1 "$1" | head -1)
H=$(ffprobe -v error -select_streams v:0 -show_entries stream=height -of default=nw=1:nk=1 "$1" | head -1)
case $BG in
  white) BGSRC="color=c=white:s=${W}x${H}";;
  black) BGSRC="color=c=black:s=${W}x${H}";;
  *) BGSRC="color=c=gray:s=${W}x${H},format=gray,geq=lum='if(mod(floor(X/16)+floor(Y/16)\,2)\,205\,150)'";;
esac
inputs=(-i "$SRC"); k=$#
fc="[0:v]select='eq(n\,$N)',setpts=0,format=rgba,split=$k"; for i in $(seq 1 $k); do fc+="[c$i]"; done; fc+=";"
i=1; row=""
for m in "$@"; do
  inputs+=(-i "$m")
  fc+="[$i:v]select='eq(n\,$N)',setpts=0,format=gray[m$i];[c$i][m$i]alphamerge[a$i];"
  fc+="$BGSRC,format=rgba,trim=end_frame=1,setpts=0[b$i];[b$i][a$i]overlay=format=auto:shortest=1,crop=$CROP,scale=iw*2:ih*2:flags=neighbor,format=rgb24,pad=iw+8:ih:0:0:red[p$i];"
  row+="[p$i]"; i=$((i+1))
done
if [ $k -gt 1 ]; then fc+="${row}hstack=inputs=$k"; else fc+="${row}null"; fi
ffmpeg -v error -y "${inputs[@]}" -filter_complex "$fc" -frames:v 1 "$OUT"
