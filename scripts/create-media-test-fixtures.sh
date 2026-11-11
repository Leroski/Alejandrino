#!/usr/bin/env bash
set -euo pipefail
fixture_dir="$(cd "$(dirname "$0")/.." && pwd)/android-native/app/src/androidTest/assets/media"
mkdir -p "$fixture_dir"
# Generated color and tone only. These assets are compiled into the test APK, never the app.
ffmpeg -hide_banner -loglevel error -y -f lavfi -i color=c=blue:s=160x120:r=12:d=2 \
  -an -c:v libx264 -pix_fmt yuv420p -g 12 "$fixture_dir/video.mp4"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i sine=frequency=440:sample_rate=44100:duration=2 \
  -c:a aac -b:a 32k "$fixture_dir/audio.m4a"
ffmpeg -hide_banner -loglevel error -y -i "$fixture_dir/video.mp4" -i "$fixture_dir/audio.m4a" \
  -map 0:v:0 -map 1:a:0 -c copy -movflags +faststart "$fixture_dir/combined.mp4"
ffmpeg -hide_banner -loglevel error -y -i "$fixture_dir/video.mp4" -c copy \
  -f dash -seg_duration 1 -use_template 0 -use_timeline 0 "$fixture_dir/video.mpd"
