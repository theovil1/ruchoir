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
  }, [open, mounted, durationMs]);

  return { mounted, closing };
}
