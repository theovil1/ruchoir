/**
 * Viewport matrix for the responsive audit.
 *
 * The goal is not "does it fit in a phone" but "does the layout stay usable, readable and
 * coherent at every width a real user can produce". We therefore sweep representative widths
 * from the tiniest phone (320) to ultrawide/4K (3840), in both orientations, at several zoom
 * levels, plus the neighbourhood of every CSS breakpoint (that is where layouts break).
 *
 * Zoom is modelled the way a browser actually applies it: increasing zoom shrinks the CSS
 * layout viewport. A 1440x900 window at 150% behaves like a 960x600 CSS viewport, so a zoom
 * entry is just a base size divided by the zoom factor. This keeps the probe (which reasons in
 * CSS pixels) accurate without needing real DPR emulation.
 */

/** Representative physical widths x heights, grouped by device class. `touch` gates the 44px target check. */
const DEVICES = [
  // Mobile portrait (critical: most traffic, least room).
  { w: 320, h: 568, touch: true, group: "mobile-portrait" },
  { w: 360, h: 780, touch: true, group: "mobile-portrait" },
  { w: 375, h: 667, touch: true, group: "mobile-portrait" },
  { w: 390, h: 844, touch: true, group: "mobile-portrait" },
  { w: 393, h: 852, touch: true, group: "mobile-portrait" },
  { w: 412, h: 915, touch: true, group: "mobile-portrait" },
  { w: 430, h: 932, touch: true, group: "mobile-portrait" },
  { w: 480, h: 800, touch: true, group: "mobile-portrait" },

  // Mobile landscape (very short heights: often where "responsive" layouts collapse).
  { w: 568, h: 320, touch: true, group: "mobile-landscape" },
  { w: 667, h: 375, touch: true, group: "mobile-landscape" },
  { w: 720, h: 412, touch: true, group: "mobile-landscape" },
  { w: 800, h: 480, touch: true, group: "mobile-landscape" },
  { w: 844, h: 390, touch: true, group: "mobile-landscape" },

  // Tablet portrait.
  { w: 600, h: 960, touch: true, group: "tablet-portrait" },
  { w: 768, h: 1024, touch: true, group: "tablet-portrait" },
  { w: 800, h: 1280, touch: true, group: "tablet-portrait" },
  { w: 820, h: 1180, touch: true, group: "tablet-portrait" },
  { w: 834, h: 1112, touch: true, group: "tablet-portrait" },
  { w: 900, h: 1200, touch: true, group: "tablet-portrait" },

  // Tablet landscape.
  { w: 960, h: 600, touch: true, group: "tablet-landscape" },
  { w: 1024, h: 768, touch: true, group: "tablet-landscape" },
  { w: 1112, h: 834, touch: true, group: "tablet-landscape" },
  { w: 1180, h: 820, touch: true, group: "tablet-landscape" },
  { w: 1280, h: 800, touch: true, group: "tablet-landscape" },

  // Desktop (test more than just 1920: 1366 and 1440 are extremely common).
  { w: 1024, h: 768, touch: false, group: "desktop" },
  { w: 1152, h: 864, touch: false, group: "desktop" },
  { w: 1280, h: 800, touch: false, group: "desktop" },
  { w: 1366, h: 768, touch: false, group: "desktop" },
  { w: 1440, h: 900, touch: false, group: "desktop" },
  { w: 1536, h: 864, touch: false, group: "desktop" },
  { w: 1600, h: 900, touch: false, group: "desktop" },
  { w: 1920, h: 1080, touch: false, group: "desktop" },
  { w: 2560, h: 1440, touch: false, group: "desktop" },
  { w: 3440, h: 1440, touch: false, group: "desktop" },
  { w: 3840, h: 2160, touch: false, group: "desktop" },
];

/** Browser zoom levels applied to one desktop and one mobile base, since zoom is often forgotten. */
const ZOOMS = [1.25, 1.5, 2];
const ZOOM_BASES = [
  { w: 1440, h: 900, touch: false, group: "desktop" },
  { w: 390, h: 844, touch: true, group: "mobile-portrait" },
];

/** The "quick" subset: enough to catch most breakage in a fast run. */
const QUICK_WIDTHS = new Set([320, 375, 768, 1024, 1280, 1440, 1920]);

/**
 * Build the full list of viewport entries. Each entry is
 * `{ label, width, height, touch, group, tags }` in CSS pixels.
 *
 * @param {number[]} breakpoints CSS breakpoint widths discovered in the stylesheets. For each,
 *   we add `bp-20, bp-1, bp, bp+1, bp+20` at a representative height, because bugs cluster there.
 */
export function buildViewports(breakpoints = []) {
  /** @type {Array<{label:string,width:number,height:number,touch:boolean,group:string,tags:string[]}>} */
  const out = [];
  const seen = new Set();
  const push = (width, height, touch, group, tags) => {
    const key = `${width}x${height}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ label: key, width, height, touch, group, tags });
  };

  for (const d of DEVICES) {
    const tags = [d.group, QUICK_WIDTHS.has(d.w) ? "quick" : "full"];
    push(d.w, d.h, d.touch, d.group, tags);
  }

  for (const base of ZOOM_BASES) {
    for (const z of ZOOMS) {
      const width = Math.round(base.w / z);
      const height = Math.round(base.h / z);
      out.push({
        label: `${base.w}x${base.h}@${Math.round(z * 100)}%`,
        width,
        height,
        touch: base.touch,
        group: `zoom-${base.group}`,
        tags: ["zoom", "full"],
      });
    }
  }

  const bpHeight = 900;
  for (const bp of breakpoints) {
    for (const delta of [-20, -1, 0, 1, 20]) {
      const width = bp + delta;
      if (width < 240 || width > 4096) continue;
      push(width, bpHeight, width < 700, "breakpoint", ["breakpoint", "full", `bp-${bp}`]);
    }
  }

  return out;
}

/** Filter helper used by the runner: keep entries whose tags include every requested tag. */
export function filterViewports(viewports, tags) {
  if (!tags || tags.length === 0) return viewports;
  return viewports.filter((v) => tags.every((t) => v.tags.includes(t)));
}
