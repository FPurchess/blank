#!/usr/bin/env bash
# Takes the docs screenshots CI captured into the committed ones, but only those that show
# something else (see same() below): the others keep their committed bytes, so the noise of a
# capture never makes a commit. Deletes committed images the capture no longer makes.
# Run by the screenshots-pr job of .github/workflows/e2e.yml; needs ffmpeg.
#
# usage: scripts/sync-screenshots.sh <captured dir> <committed dir>
set -euo pipefail

captured=${1:?usage: scripts/sync-screenshots.sh <captured dir> <committed dir>}
committed=${2:?usage: scripts/sync-screenshots.sh <captured dir> <committed dir>}
mkdir -p "$committed"

# the frames' timestamps and durations, which the script of a recording sets
timing() {
  ffmpeg -v error -i "$1" -f framemd5 - | grep -v '^#' | cut -d, -f2-4
}

# whether two images show the same: the same frames at the same times, of which at most a tenth
# differ visibly (a pixel by more than a little). Recordings aren't exact to the pixel: a GIF's
# palette shifts with every capture, and a message in the status bar goes on a timer of real time,
# so it shows a frame longer or shorter. A change of the app shows in most frames of a recording,
# and a still has to match in full.
same() {
  [ "$(timing "$1")" = "$(timing "$2")" ] || return 1
  local frames alike
  frames=$(timing "$1" | wc -l)
  # blackframe names each frame of the difference that is black: that's alike
  alike=$(ffmpeg -v info -i "$1" -i "$2" -lavfi \
    "[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]blend=all_mode=difference,format=gray,blackframe=amount=100:threshold=32" \
    -f null - 2>&1 | grep -c 'blackframe.*frame:') || true
  [ $((frames - alike)) -le $((frames / 10)) ]
}

# the artifact comes from a job that runs third-party code, so take nothing but images
for file in "$captured"/*; do
  name=$(basename "$file")
  if ! [[ -f $file && $name =~ ^[a-z0-9-]+\.(png|gif)$ ]]; then
    echo "error: unexpected file in the capture: $name" >&2
    exit 1
  fi
done

for file in "$captured"/*; do
  name=$(basename "$file")
  target="$committed/$name"
  if [ -f "$target" ] && same "$file" "$target"; then
    continue
  fi
  echo "changed: $name"
  cp "$file" "$target"
done

for target in "$committed"/*; do
  [ -e "$target" ] || continue
  name=$(basename "$target")
  if [ ! -e "$captured/$name" ]; then
    echo "removed: $name"
    rm "$target"
  fi
done
