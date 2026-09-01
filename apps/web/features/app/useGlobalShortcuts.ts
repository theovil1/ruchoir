"use client";

import { useEffect, useRef } from "react";
import { eventToChord, type Bindings, type ShortcutId } from "./shortcuts";

/**
 * Wire the global keyboard shortcuts to their handlers.
 *
 * Each command runs the handler bound to it by `bindings`. Handlers are read through a ref so the
 * window listener stays attached across renders (the caller passes a fresh handlers object every
 * render). Single-key shortcuts (no Ctrl/Cmd/Alt) are ignored while the user is typing in a field,
 * so they never swallow text; modifier combos still fire from inside inputs (e.g. Cmd+K from the
 * message composer). Pass `enabled: false` to suspend everything while a modal or overlay is open.
 */
export function useGlobalShortcuts(
  bindings: Bindings,
  handlers: Partial<Record<ShortcutId, () => void>>,
  enabled: boolean,
) {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      const chord = eventToChord(e);
      if (!chord) return;

      const current = handlersRef.current;
      let matched: ShortcutId | null = null;
      for (const id of Object.keys(current) as ShortcutId[]) {
        if (bindings[id] && bindings[id] === chord) {
          matched = id;
          break;
        }
      }
      if (!matched) return;

      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const hasModifier = e.ctrlKey || e.metaKey || e.altKey;
      // A plain key (like "?") must not trigger while the user is typing.
      if (typing && !hasModifier) return;

      e.preventDefault();
      current[matched]?.();
    };
    // Capture phase, so we get the key before any in-page listener and can preventDefault the
    // browser's own action as early as possible (e.g. Chromium focusing the omnibox on Ctrl+K).
    // Note: a few chords are reserved by the browser chrome itself (Firefox owns Ctrl+K and Ctrl+J)
    // and cannot be intercepted by any page; rebind those to a free combination if needed.
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [bindings, enabled]);
}
