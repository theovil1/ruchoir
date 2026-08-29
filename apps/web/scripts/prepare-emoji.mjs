// Builds a self-hosted emoji pack from the Microsoft Fluent Emoji repos, keyed by codepoint so the
// web client can find each asset from the emoji glyph alone (see apps/web/lib/emojiCode.ts). Only
// processes the emoji present in the given checkouts, so a sparse checkout controls the size.
//
// Usage:
//   node scripts/prepare-emoji.mjs \
//     --static  /path/to/fluentui-emoji \
//     --animated /path/to/fluentui-emoji-animated \
//     --out public/emoji            # dev: served by `next dev`; or a dir behind WORKCHAT_EMOJI_DIR
//     [--style Flat]                # Color | Flat | 3D | "High Contrast" (default Flat)
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const staticDir = opt("static", null);
const animatedDir = opt("animated", null);
const outDir = opt("out", "public/emoji");
const style = opt("style", "Flat");

// Must match apps/web/lib/emojiCode.ts exactly.
const U200D = String.fromCharCode(0x200d);
const VS16 = /️/g;
function emojiCode(emoji) {
  const s = emoji.indexOf(U200D) < 0 ? emoji.replace(VS16, "") : emoji;
  const points = [];
  let high = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (high) {
      points.push((0x10000 + ((high - 0xd800) << 10) + (c - 0xdc00)).toString(16));
      high = 0;
    } else if (c >= 0xd800 && c <= 0xdbff) {
      high = c;
    } else {
      points.push(c.toString(16));
    }
  }
  return points.join("-");
}

function emojiFolders(root) {
  const dir = join(root, "assets");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .map((name) => join(dir, name))
    .filter((p) => statSync(p).isDirectory());
}

function glyphOf(folder) {
  const meta = join(folder, "metadata.json");
  if (!existsSync(meta)) return null;
  try {
    return JSON.parse(readFileSync(meta, "utf8")).glyph ?? null;
  } catch {
    return null;
  }
}

function firstFile(dir, ext) {
  if (!existsSync(dir)) return null;
  const name = readdirSync(dir).find((n) => n.endsWith(ext));
  return name ? join(dir, name) : null;
}

mkdirSync(join(outDir, "static"), { recursive: true });
mkdirSync(join(outDir, "animated"), { recursive: true });

let staticCount = 0;
let animatedCount = 0;

if (staticDir) {
  for (const folder of emojiFolders(staticDir)) {
    const glyph = glyphOf(folder);
    if (!glyph) continue;
    // Non-skin emoji keep styles at the top level; skin-tone emoji nest them under "Default".
    const svg = firstFile(join(folder, style), ".svg") || firstFile(join(folder, "Default", style), ".svg");
    if (svg) {
      copyFileSync(svg, join(outDir, "static", `${emojiCode(glyph)}.svg`));
      staticCount += 1;
    }
  }
}

if (animatedDir) {
  for (const folder of emojiFolders(animatedDir)) {
    const glyph = glyphOf(folder);
    if (!glyph) continue;
    const png = firstFile(join(folder, "animated"), ".png") || firstFile(join(folder, "Default", "animated"), ".png");
    if (png) {
      copyFileSync(png, join(outDir, "animated", `${emojiCode(glyph)}.png`));
      animatedCount += 1;
    }
  }
}

console.log(`[prepare-emoji] ${staticCount} static + ${animatedCount} animated -> ${outDir}`);
