# AGENTS.md - apps/web

The Next.js web client, compiled to a **static export** and served by the Rust API. See
the root `AGENTS.md` for project-wide rules; this file adds app-specific context.

## Hard constraints

- **Static export only** (`output: "export"`): no SSR, no Server Actions, no Next API
  routes, no server-side image optimization. All server logic lives in the Rust API.
  Anything that needs a server goes through `fetch` to the API.
- **No Node in production.** Next.js is a build tool; the output in `out/` is what ships.
- **Self-hosted fonts.** IBM Plex Sans/Mono are served from `public/fonts/` (see the README
  there). Never load fonts from Google Fonts or any external CDN.
- **CSP is strict** (`script-src 'self'`): any script or viewer must be same-origin. The
  vendored API reference viewer lives in `public/vendor/` for this reason.

## Stack

- Next.js (App Router) + React + TypeScript.
- Tailwind CSS v4, **CSS-first**: theme tokens live in `app/globals.css` under `@theme`,
  not in a JS config. Terracotta is the only saturated color; IBM Plex is the type family.
- ESLint flat config (`eslint.config.mjs`): import and spread `eslint-config-next`'s native
  flat-config array directly. Do not wrap it in `FlatCompat` (it re-processes an already-flat
  config and crashes under ESLint 10).

> **Gotcha - the lint toolchain lags the newest majors.** `eslint-config-next` 16 pulls in
> `typescript-eslint` and `eslint-plugin-react`, which do not support the very latest majors yet:
> - **TypeScript stays on 6.x**: `next build` works with TS 7 (the native compiler) but
>   typescript-eslint does not (issue #10940), so `eslint .` crashes.
> - **ESLint stays on 9.x**: `eslint-plugin-react` 7.x uses `context.getFilename()`, removed in
>   ESLint 10, so linting crashes under ESLint 10.
> Track the newest versions the whole plugin chain supports, not the absolute newest tags; bump
> once the plugins catch up.

## Commands

- Dev server: `pnpm --filter @workchat/web dev`
- Build (static export to `out/`): `pnpm --filter @workchat/web build`
- Lint: `pnpm --filter @workchat/web lint`

## Design system

The full design system (tokens, components, screen mockups) is integrated later
from the handoff. Recreate mockups faithfully in React; do not copy prototype
internals when they do not fit. Enforce token usage with the design-system oxlint config.
