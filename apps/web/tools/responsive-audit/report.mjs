/**
 * Report writers for the responsive audit: a machine-readable `report.json` and a
 * self-contained `report.html` gallery for the targeted visual review. Both land in the
 * output directory; screenshots are referenced relatively so the folder is portable.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";

const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 };
const SEVERITY_COLOR = { critical: "#c65d45", major: "#c78a00", minor: "#7a7a7a" };

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/** Aggregate severities, console errors and CLS across every run. */
export function summarise(runs) {
  const bySeverity = { critical: 0, major: 0, minor: 0 };
  const byRule = {};
  const byCategory = { mechanical: 0, ux: 0 };
  let consoleErrors = 0;
  let pageErrors = 0;
  let worstCls = 0;
  for (const run of runs) {
    for (const f of run.findings) {
      bySeverity[f.severity] = (bySeverity[f.severity] || 0) + 1;
      byRule[f.rule] = (byRule[f.rule] || 0) + 1;
      byCategory[f.category === "ux" ? "ux" : "mechanical"] += 1;
    }
    consoleErrors += run.consoleErrors.length;
    pageErrors += run.pageErrors.length;
    if (typeof run.probeMeta?.cls === "number") worstCls = Math.max(worstCls, run.probeMeta.cls);
  }
  return { bySeverity, byRule, byCategory, consoleErrors, pageErrors, worstCls, runs: runs.length };
}

export async function writeReports(outDir, meta, runs) {
  const summary = summarise(runs);
  await writeFile(path.join(outDir, "report.json"), JSON.stringify({ meta, summary, runs }, null, 2), "utf8");
  await writeFile(path.join(outDir, "report.html"), renderHtml(meta, summary, runs), "utf8");
  return summary;
}

function renderHtml(meta, summary, runs) {
  // Only runs with something to look at go into the gallery: this is a targeted review.
  const flagged = runs
    .filter((r) => r.findings.length > 0 || r.consoleErrors.length > 0 || r.pageErrors.length > 0)
    .sort((a, b) => severityRank(b) - severityRank(a));

  const cards = flagged.map((r) => renderRunCard(r)).join("\n");
  const ruleRows = Object.entries(summary.byRule)
    .sort((a, b) => b[1] - a[1])
    .map(([rule, n]) => `<tr><td>${esc(rule)}</td><td class="num">${n}</td></tr>`)
    .join("");

  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Audit responsive - Ruchoir</title>
<style>
  :root { color-scheme: light dark; --edge: #8884; --bg: Canvas; --fg: CanvasText; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px/1.5 -apple-system, "IBM Plex Sans", system-ui, sans-serif; background: var(--bg); color: var(--fg); }
  header { padding: 24px 28px; border-bottom: 1px solid var(--edge); }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .sub { opacity: .7; font-size: 13px; }
  .wrap { padding: 24px 28px; max-width: 1200px; margin: 0 auto; }
  .kpis { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 24px; }
  .kpi { border: 1px solid var(--edge); border-radius: 10px; padding: 12px 16px; min-width: 120px; }
  .kpi b { display: block; font-size: 24px; }
  .kpi span { opacity: .7; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  table { border-collapse: collapse; margin: 8px 0 28px; }
  td, th { border: 1px solid var(--edge); padding: 4px 10px; text-align: left; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .run { border: 1px solid var(--edge); border-radius: 12px; margin: 0 0 20px; overflow: hidden; }
  .run > .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 12px 16px; background: #8881; flex-wrap: wrap; }
  .run .title { font-weight: 600; }
  .run .vp { font-variant-numeric: tabular-nums; opacity: .8; }
  .run .body { display: grid; grid-template-columns: minmax(260px, 1fr) 1.4fr; gap: 0; }
  .run img { width: 100%; height: auto; display: block; border-right: 1px solid var(--edge); background: #8881; }
  .findings { padding: 12px 16px; margin: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .finding { display: grid; grid-template-columns: auto 1fr; gap: 8px; align-items: start; }
  .badge { font-size: 11px; font-weight: 700; color: #fff; border-radius: 5px; padding: 1px 7px; white-space: nowrap; }
  .sel { font-family: "IBM Plex Mono", ui-monospace, monospace; font-size: 12px; word-break: break-all; }
  .detail { opacity: .75; font-size: 12px; }
  @media (max-width: 720px) { .run .body { grid-template-columns: 1fr; } .run img { border-right: 0; border-bottom: 1px solid var(--edge); } }
</style></head>
<body>
<header>
  <h1>Audit responsive - Ruchoir</h1>
  <div class="sub">${esc(meta.generatedAt)} - ${esc(meta.url)} - ${summary.runs} combinaisons (${meta.stateCount} etats x ${meta.viewportCount} viewports)${meta.reloaded ? " - rechargement par viewport" : ""}</div>
</header>
<div class="wrap">
  <div class="kpis">
    <div class="kpi"><b style="color:${SEVERITY_COLOR.critical}">${summary.bySeverity.critical}</b><span>critiques</span></div>
    <div class="kpi"><b style="color:${SEVERITY_COLOR.major}">${summary.bySeverity.major}</b><span>majeurs</span></div>
    <div class="kpi"><b style="color:${SEVERITY_COLOR.minor}">${summary.bySeverity.minor}</b><span>mineurs</span></div>
    <div class="kpi"><b>${summary.pageErrors}</b><span>erreurs JS</span></div>
    <div class="kpi"><b>${summary.consoleErrors}</b><span>erreurs console</span></div>
    <div class="kpi"><b>${summary.worstCls}</b><span>CLS max</span></div>
    <div class="kpi"><b>${summary.byCategory ? summary.byCategory.ux : 0}</b><span>constats UX</span></div>
  </div>
  ${ruleRows ? `<table><thead><tr><th>Regle</th><th>Occurrences</th></tr></thead><tbody>${ruleRows}</tbody></table>` : ""}
  <h2>Zones a revoir (${flagged.length})</h2>
  ${cards || "<p>Aucune anomalie detectee. </p>"}
</div>
</body></html>`;
}

function severityRank(run) {
  let rank = 0;
  for (const f of run.findings) rank += 100 - SEVERITY_ORDER[f.severity] * 10;
  rank += run.pageErrors.length * 1000;
  return rank;
}

function renderRunCard(run) {
  const findings = [...run.findings].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  const items = findings
    .map(
      (f) => `<li class="finding">
        <span class="badge" style="background:${SEVERITY_COLOR[f.severity]}">${esc(f.severity)}</span>
        <div><div class="sel">${esc(f.rule)} - ${esc(f.selector)}</div><div class="detail">${esc(f.detail || "")}</div></div>
      </li>`
    )
    .join("");
  const errItems = [...run.pageErrors.map((e) => ["JS", e]), ...run.consoleErrors.map((e) => ["console", e])]
    .map(
      ([k, e]) => `<li class="finding"><span class="badge" style="background:${SEVERITY_COLOR.critical}">${k}</span><div class="detail">${esc(e)}</div></li>`
    )
    .join("");
  const img = run.screenshot ? `<img src="${esc(run.screenshot)}" alt="${esc(run.stateLabel)} ${esc(run.viewport.label)}" loading="lazy">` : "<div></div>";
  return `<div class="run">
    <div class="head"><span class="title">${esc(run.stateLabel)}</span><span class="vp">${esc(run.viewport.label)} - ${esc(run.viewport.group)}</span></div>
    <div class="body">${img}<ul class="findings">${items}${errItems}</ul></div>
  </div>`;
}
