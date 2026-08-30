#!/usr/bin/env bash
#
# One-shot builder for the self-hosted emoji pack. Does everything:
#   1. Sparse-clones the Microsoft Fluent Emoji repos WITHOUT downloading the ~5GB of assets
#      (partial clone + sparse checkout): all Flat SVGs for the static set (light), and only a
#      curated list of animated emoji (the 5GB is the APNGs, so animated must stay curated).
#   2. Runs prepare-emoji.mjs to flatten them into a codepoint-keyed pack.
#   3. Cleans up the temporary clones.
#
# Run from the repo root:  bash apps/web/scripts/build-emoji-pack.sh
# Output (default): apps/web/public/emoji  (served by `next dev`; for prod, copy it to the dir
# behind the API's WORKCHAT_EMOJI_DIR). Override with:  OUT=/some/dir bash .../build-emoji-pack.sh
set -euo pipefail

OUT="${OUT:-apps/web/public/emoji}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Curated animated emoji (exact Fluent folder names). Add more as you like; unknown names are
# silently skipped. The full static set below covers everything else without animation.
ANIMATED=(
  "Thumbs up" "Red heart" "Fire" "Party popper" "Face with tears of joy" "Grinning face"
  "Rocket" "Eyes" "Folded hands" "Hundred points" "Rolling on the floor laughing"
  "Smiling face with heart-eyes" "Loudly crying face" "Clapping hands" "Raising hands"
  "Flexed biceps" "Waving hand" "Star-struck" "Winking face" "Smiling face with sunglasses"
  "Pleading face" "Thinking face" "Partying face" "Victory hand" "Beaming face with smiling eyes"
  "Grinning squinting face" "Face blowing a kiss" "Smiling face with hearts"
  "Face with rolling eyes" "Crying face" "Grimacing face" "Melting face" "Skull" "Ghost"
  "Robot" "Hot beverage" "Birthday cake" "Glowing star" "High voltage" "Rainbow"
  "Ok hand"
)

echo "[emoji] sparse-cloning static Fluent (Flat SVGs only)..."
git clone --quiet --depth 1 --filter=blob:none --sparse \
  https://github.com/microsoft/fluentui-emoji "$TMP/static"
git -C "$TMP/static" sparse-checkout set --no-cone \
  '/assets/*/metadata.json' '/assets/*/Flat/' '/assets/*/*/Flat/'

echo "[emoji] sparse-cloning ${#ANIMATED[@]} animated emoji..."
git clone --quiet --depth 1 --filter=blob:none --sparse \
  https://github.com/microsoft/fluentui-emoji-animated "$TMP/animated"
PATTERNS=()
for name in "${ANIMATED[@]}"; do
  PATTERNS+=("/assets/${name}/metadata.json" "/assets/${name}/animated/" "/assets/${name}/Default/animated/")
done
git -C "$TMP/animated" sparse-checkout set --no-cone "${PATTERNS[@]}"

# The APNGs are stored in Git LFS, so the checkout yields pointer files, not media. Fetch the real
# bytes from github.com/.../raw (which resolves LFS), avoiding a git-lfs dependency. Overwrite each
# pointer in place; prepare-emoji.mjs then copies the real files.
echo "[emoji] resolving Git LFS media for animated APNGs..."
( cd "$TMP/animated"
  find assets -name '*.png' | while IFS= read -r f; do
    enc="${f// /%20}"
    curl -sfL "https://github.com/microsoft/fluentui-emoji-animated/raw/main/${enc}" -o "$f" \
      || echo "  warn: could not fetch $f"
  done )

echo "[emoji] building pack -> $OUT"
node "$SCRIPT_DIR/prepare-emoji.mjs" \
  --static "$TMP/static" --animated "$TMP/animated" --out "$OUT"

echo "[emoji] done. Static = one sprite.svg (broad, native fallback for the rest), animated = curated APNGs, plus manifest.json."
