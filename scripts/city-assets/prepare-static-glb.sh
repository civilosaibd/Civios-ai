#!/usr/bin/env bash
set -euo pipefail

# Prepare ONE static prop/building/vehicle GLB for review.
# Do not use this script for skinned characters or animated GLBs.
# Requirements: Node.js LTS, @gltf-transform/cli, sha256sum (or shasum on macOS).

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <input.glb> <output.glb>" >&2
  exit 2
fi

INPUT="$1"
OUTPUT="$2"
REPORT="${OUTPUT%.*}.inspect.txt"
OUT_DIR="$(dirname "$OUTPUT")"

if [[ ! -f "$INPUT" ]]; then
  echo "Input GLB not found: $INPUT" >&2
  exit 1
fi
if [[ "$INPUT" -ef "$OUTPUT" ]]; then
  echo "Input and output must be different files." >&2
  exit 1
fi
if ! command -v gltf-transform >/dev/null 2>&1; then
  echo "Install the reviewed CLI first: npm install --global @gltf-transform/cli" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "[1/5] Validating source model..."
gltf-transform validate "$INPUT"

echo "[2/5] Inspecting source model..."
gltf-transform inspect "$INPUT" > "$REPORT"

echo "[3/5] Creating optimized copy (static asset profile)..."
# Keep the original untouched. Optimize uses meshopt by default and allows
# explicit geometry/texture settings. WebP targets transfer size; validate
# the output in the actual Three.js renderer before approving it.
gltf-transform optimize "$INPUT" "$OUTPUT" \
  --compress meshopt \
  --texture-compress webp \
  --texture-size 2048

echo "[4/5] Validating and inspecting optimized model..."
gltf-transform validate "$OUTPUT"
gltf-transform inspect "$OUTPUT" > "${OUTPUT%.*}.optimized.inspect.txt"

echo "[5/5] Checksums..."
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$INPUT" "$OUTPUT"
else
  shasum -a 256 "$INPUT" "$OUTPUT"
fi

echo
echo "Prepared: $OUTPUT"
echo "Reports:  $REPORT and ${OUTPUT%.*}.optimized.inspect.txt"
echo "NOT APPROVED: visually inspect scale, materials, normals, UVs and silhouette in Blender and the target app."
