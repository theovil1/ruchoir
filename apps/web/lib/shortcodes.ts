import { emojify, search, which } from "node-emoji";

/**
 * Replaces `:shortcode:` sequences with their emoji using node-emoji (MIT), a maintained reference
 * dataset rather than a hand-written map. Unknown shortcodes are left untouched.
 */
export function replaceShortcodes(text: string): string {
  return emojify(text);
}

/** The `:shortcode:` for an emoji glyph (e.g. `😂` -> `:joy:`), or null when it has no known name. */
export function shortcodeOf(glyph: string): string | null {
  const name = which(glyph);
  return name ? `:${name}:` : null;
}

export type ShortcodeHit = { emoji: string; name: string };

/**
 * Suggestions for a `:partial` shortcode being typed, ordered with prefix matches first so an exact
 * start (e.g. `joy` -> `:joy:`) ranks above substring matches. Backed by the same node-emoji dataset.
 */
export function searchShortcodes(query: string, limit = 7): ShortcodeHit[] {
  const q = query.toLowerCase();
  if (!q) return [];
  const hits = search(q) as ShortcodeHit[];
  return [...hits]
    .sort((a, b) => Number(b.name.startsWith(q)) - Number(a.name.startsWith(q)))
    .slice(0, limit);
}
