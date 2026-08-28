#!/usr/bin/env bash
# Audio optimization script for AISpur sound effects
# Reduces bitrate and converts to mono for smaller file size

set -euo pipefail

SOUNDS_DIR="sounds"
OPTIMIZED_DIR="sounds-optimized"
TARGET_BITRATE="96k"
TARGET_SAMPLERATE="44100"

echo "=== Audio Optimization ==="
echo "Source: $SOUNDS_DIR"
echo "Target: $OPTIMIZED_DIR"
echo "Bitrate: $TARGET_BITRATE"
echo "Sample rate: $TARGET_SAMPLERATE Hz"
echo "Channels: Mono"
echo ""

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: ffmpeg not installed"
    echo "Install: brew install ffmpeg"
    exit 1
fi

# Create output directory
mkdir -p "$OPTIMIZED_DIR"

# Process each MP3 file
for input in "$SOUNDS_DIR"/*.mp3; do
    filename=$(basename "$input")
    output="$OPTIMIZED_DIR/$filename"

    echo "Processing: $filename"

    # Optimize: reduce bitrate, downsample, mono
    ffmpeg -i "$input" \
        -ar "$TARGET_SAMPLERATE" \
        -ac 1 \
        -b:a "$TARGET_BITRATE" \
        -y \
        "$output" 2>&1 | grep -v "^frame=" || true

    original_size=$(du -h "$input" | cut -f1)
    optimized_size=$(du -h "$output" | cut -f1)

    echo "  Original: $original_size → Optimized: $optimized_size"
done

echo ""
echo "=== Summary ==="
echo "Original total:"
du -sh "$SOUNDS_DIR" | cut -f1
echo "Optimized total:"
du -sh "$OPTIMIZED_DIR" | cut -f1

echo ""
echo "To replace original files:"
echo "  rm -rf $SOUNDS_DIR && mv $OPTIMIZED_DIR $SOUNDS_DIR"
