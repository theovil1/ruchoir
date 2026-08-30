// Builds a self-hosted emoji pack from the Microsoft Fluent Emoji repos, keyed by codepoint so the
// web client can find each asset from the emoji glyph alone (see apps/web/lib/emojiCode.ts). Only
// processes the emoji present in the given checkouts, so a sparse checkout controls the size.
//
// Output layout:
//   out/sprite.svg      one SVG sprite bundling every static glyph as a <symbol id="e<code>"> so the
//                       client fetches a single cached file (via <use>) instead of one image per tile
//   out/animated/*.png  one APNG per animated codepoint (kept individual: APNGs cannot be sprited)
//   out/manifest.json   { static: [<code>...], animated: [<code>...] } so the client only ever
//                       requests an asset that exists (no 404 fallbacks, no picker flicker)
//
// Usage:
//   node scripts/prepare-emoji.mjs \
//     --static  /path/to/fluentui-emoji \
//     --animated /path/to/fluentui-emoji-animated \
//     --out public/emoji            # dev: served by `next dev`; or a dir behind WORKCHAT_EMOJI_DIR
//     [--style Flat]                # Color | Flat | 3D | "High Contrast" (default Flat)
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
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

// Turn a standalone Fluent SVG into a sprite <symbol>. Two things matter for correctness:
//   1. Preserve each glyph's own viewBox (defaults to Fluent's 32x32) so it scales in the <use>.
//   2. Namespace every internal id per codepoint. Concatenating many SVGs into one document would
//      otherwise collide on shared ids (gradients like "paint0_linear"), and url(#id) references
//      would resolve to the wrong, first-seen definition, corrupting colors.
function svgToSymbol(svgText, code) {
  const open = svgText.match(/<svg\b([^>]*)>/i);
  if (!open) return null;
  const attrs = open[1];
  const inner = svgText.slice(open.index + open[0].length).replace(/<\/svg>\s*$/i, "");
  const viewBox = (attrs.match(/viewBox\s*=\s*"([^"]*)"/i) || [, "0 0 32 32"])[1];
  const body = namespaceIds(inner, code);
  return `<symbol id="e${code}" viewBox="${viewBox}">${body}</symbol>`;
}

// Prefix every `id="x"` (and its `url(#x)` / `href="#x"` references) with the codepoint so ids stay
// unique across the whole sprite. Only rewrites references to ids actually defined in this fragment.
function namespaceIds(fragment, code) {
  const defined = new Set();
  for (const m of fragment.matchAll(/\bid="([^"]+)"/g)) defined.add(m[1]);
  if (defined.size === 0) return fragment;
  const ns = (id) => `e${code}_${id}`;
  let out = fragment.replace(/\bid="([^"]+)"/g, (whole, id) => (defined.has(id) ? `id="${ns(id)}"` : whole));
  out = out.replace(/\burl\(#([^)]+)\)/g, (whole, id) => (defined.has(id) ? `url(#${ns(id)})` : whole));
  out = out.replace(/\b(?:xlink:href|href)="#([^"]+)"/g, (whole, id) =>
    defined.has(id) ? whole.replace(`#${id}`, `#${ns(id)}`) : whole,
  );
  return out;
}

mkdirSync(join(outDir, "animated"), { recursive: true });

const staticCodes = [];
const animatedCodes = [];
const symbols = [];

if (staticDir) {
  for (const folder of emojiFolders(staticDir)) {
    const glyph = glyphOf(folder);
    if (!glyph) continue;
    // Non-skin emoji keep styles at the top level; skin-tone emoji nest them under "Default".
    const svg = firstFile(join(folder, style), ".svg") || firstFile(join(folder, "Default", style), ".svg");
    if (!svg) continue;
    const code = emojiCode(glyph);
    const symbol = svgToSymbol(readFileSync(svg, "utf8"), code);
    if (symbol) {
      symbols.push(symbol);
      staticCodes.push(code);
    }
  }
  const sprite = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" style="display:none">${symbols.join("")}</svg>`;
  writeFileSync(join(outDir, "sprite.svg"), sprite);
}

if (animatedDir) {
  for (const folder of emojiFolders(animatedDir)) {
    const glyph = glyphOf(folder);
    if (!glyph) continue;
    const png = firstFile(join(folder, "animated"), ".png") || firstFile(join(folder, "Default", "animated"), ".png");
    if (png) {
      const code = emojiCode(glyph);
      copyFileSync(png, join(outDir, "animated", `${code}.png`));
      animatedCodes.push(code);
    }
  }
}

writeFileSync(
  join(outDir, "manifest.json"),
  JSON.stringify({ static: staticCodes, animated: animatedCodes }),
);

console.log(
  `[prepare-emoji] ${staticCodes.length} static (sprite) + ${animatedCodes.length} animated -> ${outDir}`,
);
