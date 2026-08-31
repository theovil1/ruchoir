# Responsive audit

An automated responsive stress test for the Ruchoir web client. It does not ask "does the
page fit on a phone"; it checks that the layout stays usable, readable and coherent at **every**
width a real user can produce, and flags the exact spots to review.

## What it does

For every UI state (login, onboarding, each app view, each modal) it sweeps a wide matrix of
viewports (320 -> 3840 px, both orientations, several zoom levels, plus the neighbourhood of
every CSS breakpoint) and runs an in-page probe that detects:

| Rule                | Severity | What it catches                                             |
| ------------------- | -------- | ---------------------------------------------------------- |
| `document-overflow` | critical | The page scrolls horizontally (almost always a bug).       |
| `element-overflow-x`| major    | A specific element spills past the left/right edge.        |
| `text-overflow`     | major    | Text visibly overflows its box (not an intended ellipsis). |
| `touch-target`      | minor    | An interactive control is smaller than 44x44 on touch.     |
| `overlap`           | major    | Two interactive controls visibly overlap.                  |

It also runs UX / accessibility checks (finding `category: "ux"`), not just mechanical layout:

| Rule                        | Severity | What it catches                                              |
| --------------------------- | -------- | ------------------------------------------------------------ |
| `low-contrast`              | minor    | Text vs background below WCAG AA (4.5:1, or 3:1 for large).   |
| `tiny-text`                 | minor    | Visible text smaller than 12px.                              |
| `dialog-overflows-viewport` | major    | A dialog taller than the viewport (its actions are cut off). |

It also records JS/console errors and cumulative layout shift (CLS) per combination, screenshots
only the suspect ones, and writes a `report.json` plus a self-contained `report.html` gallery for
a fast, targeted visual review.

The runner exits non-zero when a **critical** issue or a JS error is found, so it can gate CI.

## Requirements

Playwright is a dev-only dependency (never shipped in the production static export). Install it
once (uses the latest stable, currently 1.62.x):

```bash
pnpm --dir apps/web add -D playwright
pnpm --dir apps/web exec playwright install chromium
```

## Run it

The app is a state machine with no URL routes, so the audit reaches each screen through the dev
deep-link (`lib/dev/deeplink.ts`), which only exists in development. Start the dev server, then
run the audit against it:

```bash
pnpm --dir apps/web dev            # terminal 1
pnpm --dir apps/web audit:responsive   # terminal 2
```

Open the report it prints at the end (`tools/responsive-audit/report/report.html`).

### Flags

| Flag              | Effect                                                                        |
| ----------------- | ----------------------------------------------------------------------------- |
| `--url <url>`     | Base URL (default `http://localhost:3000`).                                   |
| `--quick`         | Fast, representative subset of widths (320/375/768/1024/1280/1440/1920).      |
| `--tag <t,...>`   | Keep only viewports with every tag (`quick`, `zoom`, `mobile-portrait`, ...). |
| `--state <id,...>`| Keep only these states (`files`, `login`, `channel`, ...). Ids in `states.mjs`.|
| `--reload`        | Reload per viewport instead of resizing in place (slower, stricter).          |
| `--headed`        | Show the browser window.                                                      |
| `--fail-on <lvl>` | Exit non-zero on `critical` (default), `major`, or `none`. Used to gate CI.    |

Examples:

```bash
# Fast pass while iterating on one screen:
pnpm --dir apps/web audit:responsive -- --state files --quick

# Only the mobile-portrait widths, full set:
pnpm --dir apps/web audit:responsive -- --tag mobile-portrait
```

## CI

The `responsive` job in `.github/workflows/ci.yml` runs this against a `next dev` server on every
push/PR (`--quick --fail-on critical`), and uploads the report as a build artifact. It gates only on
critical issues (horizontal page overflow, JS errors), so the known `major` backlog does not block
the pipeline while the responsive layout is being built out; tighten to `--fail-on major` once that
backlog is cleared.

## Files

- `viewports.mjs` - the width/height/zoom matrix and breakpoint-neighbour generation.
- `states.mjs` - the list of UI states and their deep-link queries.
- `probe.mjs` - the in-page detector (runs in the browser; fully self-contained).
- `run.mjs` - the orchestrator (Playwright): navigate, resize, probe, screenshot.
- `report.mjs` - the JSON + HTML report writers.
- `report/` - generated output (git-ignored).

## How to read the results

1. Fix `critical` first: a horizontally scrolling page usually points at one unconstrained
   element (fixed width, `white-space: nowrap`, an image or a table). The `element-overflow-x`
   findings in the same run name the culprit.
2. Then `major`: overlaps and text spilling out of their boxes.
3. `touch-target` and `minor` are polish for the mobile pass.

The point is to build the responsive layout **against the content**: fix the width where the
content starts breaking, not around a specific device size.
