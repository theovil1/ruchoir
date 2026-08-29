import { emojify } from "node-emoji";

/**
 * Replaces `:shortcode:` sequences with their emoji using node-emoji (MIT), a maintained reference
 * dataset rather than a hand-written map. Unknown shortcodes are left untouched.
 */
export function replaceShortcodes(text: string): string {
  return emojify(text);
}
