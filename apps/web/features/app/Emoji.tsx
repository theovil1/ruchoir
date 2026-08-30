"use client";

import type { CSSProperties } from "react";
import { emojiCode } from "@/lib/emojiCode";
import { useEmojiManifest } from "./emojiManifest";
import { useSettings } from "./settings";

export type EmojiProps = {
  emoji: string;
  size?: number;
  style?: CSSProperties;
  /**
   * Opt in to the animated APNG for this glyph. Off by default: animation is reserved for reactions,
   * so message bodies and the picker stay on the calm static sprite even when the animated setting is
   * on. Still gated by the `emojiAnimated` user setting and by the pack actually having an APNG.
   */
  animated?: boolean;
};

/**
 * Renders an emoji as a self-hosted Fluent asset when the pack is installed, falling back gracefully:
 * animated APNG (opt-in, when enabled) -> static Fluent (from the shared SVG sprite) -> OS-native glyph.
 *
 * The pack manifest (see emojiManifest.ts) is consulted first, so we only ever request an asset that
 * exists: a single cached sprite covers every static glyph (one request for the whole picker instead
 * of one per tile), and animated PNGs are fetched only where a caller opts in and the codepoint has one.
 * Same-origin only, no remote request.
 */
export function Emoji({ emoji, size = 18, style, animated = false }: EmojiProps) {
  const { emojiAnimated, emojiPack } = useSettings();
  const manifest = useEmojiManifest();
  const code = emojiCode(emoji);

  if (emojiPack && manifest) {
    if (animated && emojiAnimated && manifest.animated.has(code)) {
      return (
        <img
          className="wc-emoji"
          src={`/emoji/animated/${code}.png`}
          alt={emoji}
          width={size}
          height={size}
          draggable={false}
          loading="lazy"
          decoding="async"
          style={style}
        />
      );
    }
    if (manifest.static.has(code)) {
      return (
        <svg
          className="wc-emoji"
          width={size}
          height={size}
          role="img"
          aria-label={emoji}
          style={style}
        >
          {/* External reference into the shared sprite; the browser fetches and caches it once. */}
          <use href={`/emoji/sprite.svg#e${code}`} />
        </svg>
      );
    }
  }

  return (
    <span style={{ fontSize: size, lineHeight: 1, ...style }} role="img" aria-label={emoji}>
      {emoji}
    </span>
  );
}
