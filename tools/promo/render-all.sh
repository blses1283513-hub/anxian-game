#!/bin/bash
# final frames: landscape and portrait in parallel, 24 frames a second
cd "$(dirname "$0")"
for s in dark title orbit faces walk gun give tea light scan shot2 ghost results end; do
  node render.js $s 1280 720 frames/L-$s 24 >> render.log 2>&1 &
  node render.js $s 720 1280 frames/P-$s 24 >> render.log 2>&1 &
  wait
done
echo ALLDONE >> render.log
