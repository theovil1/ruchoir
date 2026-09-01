"use client";

import { useEffect, useState } from "react";

/**
 * Keeps a component mounted through its exit animation. Returns `mounted` (true while entering,
 * visible, or exiting) and `closing` (true during the exit window). Toggle CSS classes on these.
 */
export function useMountAnimation(open: boolean, durationMs: number) {
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    // `mounted` must persist as state through the exit window (so the element stays rendered while it
    // animates out), which requires setting it synchronously here. This is the canonical enter/exit
    // pattern, not derivable state, so the set-state-in-effect heuristic does not apply.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (open) {
      setMounted(true);
      setClosing(false);
      return;
    }
    if (!mounted) return;
    setClosing(true);
    const t = setTimeout(() => {
      setMounted(false);
      setClosing(false);
    }, durationMs);
    return () => clearTimeout(t);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [open, mounted, durationMs]);

  return { mounted, closing };
}
