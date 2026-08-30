"use client";

import { useEffect, useState } from "react";

/**
 * Client-side index of the self-hosted emoji pack. Loaded once from `/emoji/manifest.json`, it tells
 * the renderer which codepoints have a static (sprite) or animated (APNG) asset, so `<Emoji>` never
 * fires a request that would 404. Without it, every glyph optimistically requested an animated PNG
 * (only ~40 exist) and fell back on error, flooding the network and flickering when the picker opened.
 *
 * The manifest is tiny (a list of codepoint keys) and the pack is optional: if it is absent the fetch
 * fails and both sets stay empty, so every glyph renders with the OS-native fallback, unchanged.
 */
export type EmojiManifest = {
  /** Codepoint keys (see lib/emojiCode.ts) present as symbols in `/emoji/sprite.svg`. */
  static: Set<string>;
  /** Codepoint keys present as animated APNGs under `/emoji/animated/`. */
  animated: Set<string>;
};

const EMPTY: EmojiManifest = { static: new Set(), animated: new Set() };

let cache: Promise<EmojiManifest> | null = null;

/**
 * Fetch (and memoise) the pack manifest. Also warms the browser cache for the static sprite so the
 * first `<use>` reference paints instantly instead of blocking on a fetch when the picker opens.
 */
export function loadEmojiManifest(): Promise<EmojiManifest> {
  if (cache) return cache;
  cache = fetch("/emoji/manifest.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((json): EmojiManifest => {
      if (!json) return EMPTY;
      const staticCodes: string[] = Array.isArray(json.static) ? json.static : [];
      const animated: string[] = Array.isArray(json.animated) ? json.animated : [];
      // Prefetch the sprite once we know it exists; ignore failures (pack may be static-less).
      if (staticCodes.length > 0) void fetch("/emoji/sprite.svg").catch(() => {});
      return { static: new Set(staticCodes), animated: new Set(animated) };
    })
    .catch(() => EMPTY);
  return cache;
}

/**
 * React access to the pack manifest. Returns `null` until it resolves; during that brief window the
 * renderer uses the native glyph, then swaps to Fluent assets once the index is known.
 */
export function useEmojiManifest(): EmojiManifest | null {
  const [manifest, setManifest] = useState<EmojiManifest | null>(null);
  useEffect(() => {
    let alive = true;
    loadEmojiManifest().then((m) => {
      if (alive) setManifest(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return manifest;
}
