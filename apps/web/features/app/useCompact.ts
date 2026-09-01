"use client";

import { useEffect, useState } from "react";

/**
 * True when the viewport is narrower than `breakpoint` (default 960px), i.e. the app should use
 * its compact, single-column shell (drawer + bottom tabs) instead of the desktop columns.
 *
 * The breakpoint is content-driven: below ~960px the four-column desktop shell can no longer fit
 * (see the responsive audit). SSR-safe: renders `false` on the server, then corrects on mount.
 */
export function useCompact(breakpoint = 960): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const update = () => setCompact(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [breakpoint]);
  return compact;
}
