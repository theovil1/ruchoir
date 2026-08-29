/**
 * Canonical codepoint key for an emoji, used as the self-hosted asset filename. Same algorithm as
 * Twemoji: join surrogate pairs, and drop the U+FE0F variation selector unless the sequence has a
 * ZWJ. The emoji-pack prepare script (scripts/prepare-emoji.mjs) uses the identical logic on each
 * emoji's glyph, so filenames match by construction (no hand-maintained manifest).
 */
const U200D = String.fromCharCode(0x200d);
const VS16 = /️/g;

function toCodePoint(str: string): string {
  const points: string[] = [];
  let high = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
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

export function emojiCode(emoji: string): string {
  const cleaned = emoji.indexOf(U200D) < 0 ? emoji.replace(VS16, "") : emoji;
  return toCodePoint(cleaned);
}
