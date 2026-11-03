#!/usr/bin/env bash
set -euo pipefail

# Static props/buildings/vehicles only. Do not use for skinned/animated GLBs.
if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <input.glb> <output.glb>" >&2
  exit 2
fi

INPUT="$1"
OUTPUT="$2"
OUT_DIR="$(dirname "$OUTPUT")"
BASE="${OUTPUT%.*}"

[[ -f "$INPUT" ]] || { echo "Input GLB not found: $INPUT" >&2; exit 1; }
[[ "$INPUT" -ef "$OUTPUT" ]] && { echo "Input and output must differ." >&2; exit 1; }
command -v gltf-transform >/dev/null 2>&1 || {
  echo "Install Node.js LTS and run: npm install --global @gltf-transform/cli" >&2
  exit 1
}
mkdir -p "$OUT_DIR"

echo "[1/5] Validate source GLB..."
gltf-transform validate "$INPUT"

echo "[2/5] Inspect source GLB..."
gltf-transform inspect "$INPUT" > "$BASE.inspect.txt"

echo "[3/5] Create a separate static optimization copy..."
# Geometry compression is deliberately disabled until the app's GLTFLoader
# is configured and tested with a matching decoder. Preserve scene hierarchy.
gltf-transform optimize "$INPUT" "$OUTPUT" \
  --compress false \
  --texture-compress webp \
  --texture-size 2048 \
  --simplify false \
  --flatten false \
  --join false \
  --instance false \
  --palette false

echo "[4/5] Validate and inspect optimized GLB..."
gltf-transform validate "$OUTPUT"
gltf-transform inspect "$OUTPUT" > "$BASE.optimized.inspect.txt"

echo "[5/5] SHA-256 checksums..."
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$INPUT" "$OUTPUT"
else
  shasum -a 256 "$INPUT" "$OUTPUT"
fi

echo "Prepared: $OUTPUT"
echo "Reports: $BASE.inspect.txt and $BASE.optimized.inspect.txt"
echo "NOT APPROVED until Blender and in-app visual review pass."
