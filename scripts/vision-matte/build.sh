#!/bin/sh
# Build vision-matte (Apple Vision matting CLI). Usage: build.sh [OUTPUT_BINARY]
set -eu
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HERE/vision-matte}"
mkdir -p "$(dirname "$OUT")"
swiftc -O -parse-as-library -target arm64-apple-macos14.0 \
  -framework Vision -framework AVFoundation -framework CoreImage -framework Accelerate \
  "$HERE/main.swift" -o "$OUT"
echo "built $OUT"
