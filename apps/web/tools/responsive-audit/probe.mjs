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
 * It also runs UX / accessibility checks (category "ux" or "a11y"):
 *   - low-contrast         text below the WCAG AA ratio for its size
 *   - tiny-text            text under 12px
 *   - dialog-overflows-viewport  a dialog taller than the viewport hides its own actions
 *   - accessible-name      an interactive control exposes no accessible name (WCAG 4.1.2)
 *   - icon-contrast        a meaningful icon below 3:1 against its backdrop (WCAG 1.4.11)
 *   - img-alt              a content image with no alt attribute
 *
 * ...plus screen-reader structure checks (what a blind user needs to navigate and operate the app):
 *   - html-lang            <html> has no lang (wrong speech synthesiser)
 *   - landmark-main        no (or more than one) main landmark to skip to
 *   - heading-order        no h1, or a skipped heading level
 *   - aria-hidden-focusable  focus can land on content hidden from the screen reader
 *   - aria-ref-broken      aria-labelledby/describedby/controls points at a missing id
 *   - duplicate-id         a repeated id breaks label/aria associations
 *   - dialog-name          a dialog with no accessible name
 *   - positive-tabindex    a positive tabindex reorders the focus sequence
 *
 * Each finding is `{ rule, severity, selector, detail, rect, category }`. Severity is one of
 * "critical" | "major" | "minor". The runner adds state/viewport/theme context around it.
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
    // Decorative text removed from the a11y tree (e.g. a faint "·" separator) is not subject to the
    // text-contrast rule; skip it, consistent with the icon-contrast check.
    if (el.closest('[aria-hidden="true"]')) continue;
    // WCAG 1.4.3 exempts text in a disabled/inactive control (a dimmed button label is expected).
    if (el.closest(":disabled, [aria-disabled='true']")) continue;
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

  // ---- Accessibility of controls, icons and images (RGAA / WCAG name + non-text contrast) ----

  /** The accessible name of a control, from the properties assistive tech actually uses. */
  function accessibleName(el) {
    const label = (el.getAttribute("aria-label") || "").trim();
    if (label) return label;
    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const t = labelledby
        .split(/\s+/)
        .map((id) => (document.getElementById(id)?.textContent || "").trim())
        .join(" ")
        .trim();
      if (t) return t;
    }
    const title = (el.getAttribute("title") || "").trim();
    if (title) return title;
    const text = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (text) return text;
    // Name lent by a nested labelled image or icon.
    const named = el.querySelector("img[alt]:not([alt='']), svg[aria-label], [role='img'][aria-label]");
    if (named) {
      const n = (named.getAttribute("alt") || named.getAttribute("aria-label") || "").trim();
      if (n) return n;
    }
    if (el.tagName === "INPUT") {
      const type = (el.getAttribute("type") || "text").toLowerCase();
      if (type === "submit" || type === "button" || type === "reset") return (el.getAttribute("value") || "").trim();
      if (el.id) {
        const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (forLabel && forLabel.textContent.trim()) return forLabel.textContent.trim();
      }
      const wrapLabel = el.closest("label");
      if (wrapLabel && wrapLabel.textContent.trim()) return wrapLabel.textContent.trim();
    }
    return "";
  }

  // 1) Interactive controls with no accessible name (a screen reader announces nothing actionable).
  let nameCount = 0;
  const controlSel = 'a[href], button, [role="button"], input:not([type="hidden"]), select, textarea';
  for (const el of document.querySelectorAll(controlSel)) {
    if (nameCount >= maxPerRule) break;
    if (!isVisible(el)) continue;
    if (el.getAttribute("aria-hidden") === "true") continue; // intentionally removed from the a11y tree
    if (!accessibleName(el)) {
      add("accessible-name", "major", el, `${el.tagName.toLowerCase()} control has no accessible name`, "a11y");
      nameCount++;
    }
  }

  // 2) Meaningful icons must clear 3:1 against their backdrop (WCAG 1.4.11 non-text contrast).
  //    Lucide glyphs paint with currentColor, so the SVG's computed color is the glyph colour.
  //    Decorative (aria-hidden) glyphs are skipped unless they are the sole content of a control,
  //    in which case they carry meaning and must be legible.
  let iconCount = 0;
  for (const svg of document.querySelectorAll("svg")) {
    if (iconCount >= maxPerRule) break;
    if (!isVisible(svg)) continue;
    // WCAG 1.4.11 exempts inactive/disabled components (a dimmed icon on a disabled control is
    // expected), consistent with the disabled exemption in the text-contrast check above.
    if (svg.closest(":disabled, [aria-disabled='true']")) continue;
    if (svg.getAttribute("aria-hidden") === "true") {
      const ctrl = svg.closest('a[href], button, [role="button"]');
      const ctrlText = ctrl ? (ctrl.textContent || "").replace(/\s+/g, "").trim() : "";
      if (!ctrl || ctrlText) continue; // truly decorative (next to a text label), skip
    }
    const col = parseColor(getComputedStyle(svg).color);
    if (!col) continue;
    const ratio = contrast(col, effectiveBg(svg));
    if (ratio + 0.05 < 3) {
      add("icon-contrast", "major", svg, `icon contrast ${ratio.toFixed(2)}:1 < 3:1`, "a11y");
      iconCount++;
    }
  }

  // 3) Content images with no alt attribute at all (alt="" is a valid decorative opt-out).
  let imgCount = 0;
  for (const img of document.querySelectorAll("img")) {
    if (imgCount >= maxPerRule) break;
    if (!isVisible(img)) continue;
    if (img.getAttribute("alt") === null) {
      add("img-alt", "major", img, "img has no alt attribute", "a11y");
      imgCount++;
    }
  }

  // ---- Screen-reader structure (what a blind user relies on to navigate and operate the app) ----

  const focusableSel = 'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex], [contenteditable="true"]';
  const isTabbable = (el) => {
    if (el.matches("[disabled]") || el.getAttribute("aria-hidden") === "true") return false;
    const ti = el.getAttribute("tabindex");
    if (ti !== null && parseInt(ti, 10) < 0) return false;
    return true;
  };

  // 4) Document language: a screen reader picks its speech synthesiser from <html lang>. Missing or
  //    empty lang makes it read every word with the wrong phonemes.
  const langAttr = (document.documentElement.getAttribute("lang") || "").trim();
  if (!langAttr) {
    add("html-lang", "major", document.documentElement, "<html> has no lang attribute", "a11y");
  }

  // 5) Main landmark: SR users jump to "main" to skip the chrome. Exactly one is expected.
  const mains = [...document.querySelectorAll('main, [role="main"]')].filter(isVisible);
  if (mains.length === 0) {
    add("landmark-main", "major", document.body, "no main landmark (SR users cannot skip to content)", "a11y");
  } else if (mains.length > 1) {
    add("landmark-main", "major", mains[1], `${mains.length} main landmarks (there must be one)`, "a11y");
  }

  // 6) Heading order: SR users navigate by headings. Flag a missing h1 and any skipped level.
  //    A heading counts if it is in the accessibility tree (not display:none / visibility:hidden /
  //    aria-hidden) with text - even a visually-hidden "sr-only" heading is announced, so it must not
  //    be filtered out by the layout-oriented isVisible (which rejects clipped/1px-parked elements).
  const inA11yTree = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    return el.textContent.trim().length > 0;
  };
  const headings = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"][aria-level]')].filter(inA11yTree);
  let prevLevel = 0;
  let headingFlagged = false;
  for (const h of headings) {
    const level = h.getAttribute("aria-level")
      ? parseInt(h.getAttribute("aria-level"), 10)
      : parseInt(h.tagName[1], 10);
    if (!prevLevel && level !== 1 && !headingFlagged) {
      add("heading-order", "major", h, `first heading is h${level}, not h1`, "a11y");
      headingFlagged = true;
    } else if (prevLevel && level > prevLevel + 1) {
      add("heading-order", "major", h, `heading jumps from h${prevLevel} to h${level}`, "a11y");
    }
    prevLevel = level;
  }
  if (headings.length === 0) {
    add("heading-order", "minor", document.body, "no headings at all (no structure to navigate)", "a11y");
  }

  // 7) Focusable content inside aria-hidden: the SR skips it but the keyboard still lands on it,
  //    stranding focus on an element the SR will not announce.
  let hiddenFocus = 0;
  for (const hidden of document.querySelectorAll('[aria-hidden="true"]')) {
    if (hiddenFocus >= maxPerRule) break;
    const focusable = hidden.matches(focusableSel) ? hidden : hidden.querySelector(focusableSel);
    if (focusable && isTabbable(focusable) && isVisible(hidden)) {
      add("aria-hidden-focusable", "major", focusable, "focusable element inside aria-hidden subtree", "a11y");
      hiddenFocus++;
    }
  }

  // 8) Broken ARIA references: a name/description/relationship pointing at an id that does not exist
  //    is announced as nothing.
  let refBroken = 0;
  for (const attr of ["aria-labelledby", "aria-describedby", "aria-controls", "aria-activedescendant"]) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      if (refBroken >= maxPerRule) break;
      const ids = (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean);
      const missing = ids.filter((id) => !document.getElementById(id));
      if (missing.length) {
        add("aria-ref-broken", "major", el, `${attr} points at missing id(s): ${missing.join(", ")}`, "a11y");
        refBroken++;
      }
    }
  }

  // 9) Duplicate ids: they break every aria reference and label association that targets them.
  const idCounts = new Map();
  for (const el of document.querySelectorAll("[id]")) {
    const id = el.id;
    idCounts.set(id, (idCounts.get(id) || 0) + 1);
  }
  let dupCount = 0;
  for (const [id, n] of idCounts) {
    if (dupCount >= maxPerRule) break;
    if (n > 1) {
      add("duplicate-id", "major", document.getElementById(id) || document.body, `id "${id}" used ${n} times`, "a11y");
      dupCount++;
    }
  }

  // 10) Dialogs must expose an accessible name, or the SR announces "dialog" with no idea what it is.
  for (const dlg of document.querySelectorAll('[role="dialog"], [role="alertdialog"], dialog[open]')) {
    if (!isVisible(dlg)) continue;
    if (!accessibleName(dlg)) {
      add("dialog-name", "major", dlg, "dialog has no accessible name (aria-label / aria-labelledby)", "a11y");
    }
  }

  // 11) Positive tabindex reorders the tab sequence unpredictably; the natural DOM order should win.
  let posTab = 0;
  for (const el of document.querySelectorAll("[tabindex]")) {
    if (posTab >= maxPerRule) break;
    if (parseInt(el.getAttribute("tabindex"), 10) > 0) {
      add("positive-tabindex", "minor", el, `tabindex="${el.getAttribute("tabindex")}" reorders focus`, "a11y");
      posTab++;
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
