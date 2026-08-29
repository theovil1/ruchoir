"use client";

import { type CSSProperties, useState } from "react";
import { emojiCode } from "@/lib/emojiCode";
import { useSettings } from "./settings";

export type EmojiProps = { emoji: string; size?: number; style?: CSSProperties };

/**
 * Renders an emoji as a self-hosted Fluent asset when the emoji pack is installed, falling back
 * gracefully: animated (when enabled) -> static Fluent -> OS-native glyph. Same-origin only, no
 * remote request. Assets come from the optional pack (see scripts/build-emoji-pack.sh); a missing
 * file simply advances the fallback.
 */
export function Emoji({ emoji, size = 18, style }: EmojiProps) {
  const { emojiAnimated, emojiPack } = useSettings();
  const [failedAnimated, setFailedAnimated] = useState(false);
  const [failedStatic, setFailedStatic] = useState(false);
  const code = emojiCode(emoji);

  const useAnimated = emojiPack && emojiAnimated && !failedAnimated;
  const useStatic = emojiPack && !failedStatic;

  if (useAnimated) {
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
        onError={() => setFailedAnimated(true)}
        style={style}
      />
    );
  }
  if (useStatic) {
    return (
      <img
        className="wc-emoji"
        src={`/emoji/static/${code}.svg`}
        alt={emoji}
        width={size}
        height={size}
        draggable={false}
        loading="lazy"
        decoding="async"
        onError={() => setFailedStatic(true)}
        style={style}
      />
    );
  }
  return (
    <span style={{ fontSize: size, lineHeight: 1, ...style }} role="img" aria-label={emoji}>
      {emoji}
    </span>
  );
}
