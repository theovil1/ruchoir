/**
 * In-page responsive probe. This function is serialised and executed inside the page by
 * Playwright (`page.evaluate(PROBE, opts)`), so it must be fully self-contained: every helper
 * is nested, and it references nothing from the module scope.
 *
 * It reasons in CSS pixels and reports layout pathologies that a screenshot alone would not
 * make obvious:
 *   - document-overflow    the page scrolls horizontally (almost always a bug)
 *   - element-overflow-x   a specific element spills past the viewport's left/right edge
 *   - text-overflow        text visibly overflows its box (spilling, not an intended ellipsis)
 *   - touch-target         an interactive control is smaller than 44x44 on a touch viewport
 *   - overlap              two interactive controls visibly overlap
 *
 * Each finding is `{ rule, severity, selector, detail, rect }`. Severity is one of
 * "critical" | "major" | "minor". The runner adds state/viewport context around it.
 */

export const PROBE = ({ isTouch, tolerance = 2, maxPerRule = 30 }) => {
  const findings = [];
  const add = (rule, severity, el, detail, category = "mechanical") => {
    findings.push({ rule, severity, selector: cssPath(el), detail, rect: rectOf(el), category });
  };

  /** A compact, human-readable selector path (id wins; else tag + nth-of-type + first class). */
  function cssPath(el) {
    if (!el || el === document.documentElement) return "html";
    const parts = [];
    let node = el;
    let depth = 0;
    while (node && node.nodeType === 1 && node !== document.body && depth < 5) {
      if (node.id) {
        parts.unshift(`#${node.id}`);
        break;
      }
      let sel = node.tagName.toLowerCase();
      const cls = (node.getAttribute("class") || "").trim().split(/\s+/)[0];
      if (cls) sel += `.${cls}`;
      const parent = node.parentElement;
      if (parent) {
        const sameTag = [...parent.children].filter((c) => c.tagName === node.tagName);
        if (sameTag.length > 1) sel += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
      }
      parts.unshift(sel);
      node = node.parentElement;
      depth++;
    }
    return parts.join(" > ") || el.tagName.toLowerCase();
  }

  function rectOf(el) {
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }

  function isVisible(el) {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    // Ignore elements deliberately parked off-screen (screen-reader-only, closed drawers).
    if (r.right <= 0 || r.bottom <= 0) return false;
    return true;
  }

  // True when the element's center is actually reachable: on-screen and not covered by another
  // stacking layer (e.g. a dialog scrim). Used to keep interaction checks (touch-target, overlap)
  // from flagging controls that sit behind an overlay or are pushed off the viewport.
  function isHittable(el) {
    const r = el.getBoundingClientRect();
    const cx = Math.floor(r.left + r.width / 2);
    const cy = Math.floor(r.top + r.height / 2);
    if (cx < 0 || cy < 0 || cx >= window.innerWidth || cy >= window.innerHeight) return false;
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) return false;
    return hit === el || el.contains(hit) || hit.contains(el);
  }

  const vw = document.documentElement.clientWidth;
  const all = [...document.querySelectorAll("body *")];

  // 1) Document-level horizontal overflow.
  const docScroll = document.documentElement.scrollWidth;
  if (docScroll > window.innerWidth + tolerance) {
    findings.push({
      rule: "document-overflow",
      severity: "critical",
      selector: "html",
      detail: `scrollWidth ${docScroll} > innerWidth ${window.innerWidth}`,
      rect: null,
    });
  }

  // True when an ancestor is a horizontal scroller that fits the viewport: the element is reachable
  // by scrolling (a tab strip, carousel, scrollable table), not a page-overflow bug.
  function inHScroller(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      if ((cs.overflowX === "auto" || cs.overflowX === "scroll") && node.scrollWidth > node.clientWidth + 1) {
        const nr = node.getBoundingClientRect();
        if (nr.right <= vw + tolerance && nr.left >= -tolerance) return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  // 2) Elements spilling past the horizontal edges. Keep only innermost culprits to cut noise.
  const overflowers = [];
  for (const el of all) {
    if (!isVisible(el)) continue;
    const s = getComputedStyle(el);
    if (s.position === "fixed" || s.position === "sticky") continue; // handled by their own layout
    if (inHScroller(el)) continue; // reachable by horizontal scroll, not a page overflow
    const r = el.getBoundingClientRect();
    const overRight = r.right - vw;
    const overLeft = -r.left;
    if (overRight > tolerance || overLeft > tolerance) {
      overflowers.push({ el, over: Math.round(Math.max(overRight, overLeft)) });
    }
  }
  const overflowEls = new Set(overflowers.map((o) => o.el));
  const leaves = overflowers.filter((o) => ![...o.el.children].some((c) => overflowEls.has(c)));
  leaves
    .sort((a, b) => b.over - a.over)
    .slice(0, maxPerRule)
    .forEach((o) => add("element-overflow-x", "major", o.el, `overflows edge by ${o.over}px`));

  // 3) Text visibly overflowing its box (spilling out, not a deliberate ellipsis).
  let textCount = 0;
  for (const el of all) {
    if (textCount >= maxPerRule) break;
    if (!isVisible(el)) continue;
    if (!el.firstChild || el.children.length > 0) continue; // leaf text nodes only
    const s = getComputedStyle(el);
    const clipped = s.overflow === "hidden" || s.overflowX === "hidden" || s.textOverflow === "ellipsis";
    if (clipped) continue; // intended truncation, not a bug
    if (el.scrollWidth > el.clientWidth + tolerance && el.clientWidth > 0) {
      add("text-overflow", "major", el, `text overflows by ${el.scrollWidth - el.clientWidth}px`);
      textCount++;
    }
  }

  // 4) Touch targets under 44x44 on touch viewports.
  if (isTouch) {
    const interactiveSel = 'a[href], button, input, select, textarea, [role="button"], [tabindex]:not([tabindex="-1"])';
    let tCount = 0;
    for (const el of document.querySelectorAll(interactiveSel)) {
      if (tCount >= maxPerRule) break;
      if (!isVisible(el) || !isHittable(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 44 || r.height < 44) {
        add("touch-target", "minor", el, `${Math.round(r.width)}x${Math.round(r.height)} < 44x44`);
        tCount++;
      }
    }
  }

  // The rectangle actually painted: the element's box intersected with every clipping ancestor, so
  // a control scrolled halfway under a bar counts only its VISIBLE part, not its full bounding box.
  function visRect(el) {
    const r = el.getBoundingClientRect();
    let left = r.left, top = r.top, right = r.right, bottom = r.bottom;
    let node = el.parentElement;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      if (cs.overflow !== "visible" || cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const nr = node.getBoundingClientRect();
        left = Math.max(left, nr.left);
        top = Math.max(top, nr.top);
        right = Math.min(right, nr.right);
        bottom = Math.min(bottom, nr.bottom);
      }
      node = node.parentElement;
    }
    return { left, top, right, bottom };
  }

  // 5) Overlapping interactive controls (capped, ancestors excluded, measured on visible pixels).
  const interactive = [...document.querySelectorAll('a[href], button, [role="button"], input, select')]
    .filter((el) => isVisible(el) && isHittable(el))
    .slice(0, 150);
  let oCount = 0;
  outer: for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      if (oCount >= 20) break outer;
      const a = interactive[i];
      const b = interactive[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = visRect(a);
      const rb = visRect(b);
      const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (ox > 4 && oy > 4) {
        findings.push({
          rule: "overlap",
          severity: "major",
          selector: `${cssPath(a)}  ∩  ${cssPath(b)}`,
          detail: `overlap ${Math.round(ox)}x${Math.round(oy)}px`,
          rect: rectOf(a),
        });
        oCount++;
      }
    }
  }

  // ---- UX / accessibility checks (not just mechanical layout) ----

  function parseColor(str) {
    const m = str && str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] };
  }
  function relLum({ r, g, b }) {
    const f = (c) => {
      c /= 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function contrast(fg, bg) {
    const l1 = relLum(fg);
    const l2 = relLum(bg);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }
  /** Walk up for the first opaque background so contrast is measured against what the eye sees. */
  function effectiveBg(el) {
    let node = el;
    while (node && node.nodeType === 1) {
      const c = parseColor(getComputedStyle(node).backgroundColor);
      if (c && c.a >= 0.95) return c;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  let uxText = 0;
  for (const el of all) {
    if (uxText >= maxPerRule) break;
    if (!isVisible(el) || el.children.length > 0 || !el.textContent.trim()) continue;
    const s = getComputedStyle(el);
    const size = parseFloat(s.fontSize);

    // Text too small to read comfortably.
    if (size && size < 12) {
      add("tiny-text", "minor", el, `font-size ${Math.round(size)}px < 12px`, "ux");
      uxText++;
      continue;
    }

    // Low contrast (WCAG AA: 4.5 for normal text, 3.0 for large/bold text).
    const fg = parseColor(s.color);
    if (fg) {
      const ratio = contrast(fg, effectiveBg(el));
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      const min = large ? 3 : 4.5;
      if (ratio + 0.05 < min) {
        add("low-contrast", "minor", el, `contrast ${ratio.toFixed(2)}:1 < ${min}:1`, "ux");
        uxText++;
      }
    }
  }

  // A dialog taller than the viewport hides its own actions (footer buttons unreachable).
  for (const dlg of document.querySelectorAll('[role="dialog"], .wc-dlg')) {
    const r = dlg.getBoundingClientRect();
    if (r.height > window.innerHeight + 2) {
      add("dialog-overflows-viewport", "major", dlg, `dialog ${Math.round(r.height)}px > viewport ${window.innerHeight}px`, "ux");
    }
  }

  return {
    findings,
    meta: {
      scrollWidth: docScroll,
      innerWidth: window.innerWidth,
      clientWidth: vw,
      cls: typeof window.__wcCls === "number" ? Number(window.__wcCls.toFixed(4)) : null,
    },
  };
};
