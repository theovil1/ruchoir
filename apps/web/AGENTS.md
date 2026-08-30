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

Integration started in **L5a** (UI shell exploration on mocked data; spec in
`docs/specs/L5a-ui-shell-exploration.md`). Recreate mockups faithfully in React; do not copy
prototype internals when they do not fit. Enforce token usage with the design-system oxlint config.

- **Tokens** live in `app/tokens.css` (the full DS variable set as `:root` custom properties)
  plus a brand subset mirrored in `app/globals.css` `@theme` for Tailwind utilities. Component
  styles are in `app/components.css`, ported once into static CSS (the handoff injected them at
  runtime; we do not, to stay static-export- and CSP-safe).
- **Primitives** are in `components/ds/` (import from `@/components/ds`).
- **Icons: `lucide-react`** (ISC, community-governed), rendered as inline SVG via the map in
  `components/ds/Icon.tsx`. The handoff's `Icon` loads Lucide from `unpkg.com` at runtime: do NOT
  copy that, it breaks sovereignty and the strict CSP. Likewise the handoff's `tokens/fonts.css`
  pulls IBM Plex from Google Fonts: ignore it, fonts are self-hosted (see above). Extend the icon
  map rather than reaching for a URL.
- **No remote media.** In the exploration, images/media are rendered from local sources (inline
  SVG, or same-origin bytes later), never a remote `<img src>`: sovereignty + CSP. See
  `features/channel/InlineImage.tsx` for the pattern.
- **App code** is organized as `features/<area>/` (screens) reading domain data only through the
  data seam `@/lib/data`, never from `lib/mock` directly (this is what lets L5b swap mocks for the
  real API without touching views).
- **Floating UI** (menus, emoji picker, profile card) uses `components/ds/Popover.tsx`: portaled to
  `body`, `position: fixed`, viewport-aware (flips/clamps so it never overflows). Do not hand-roll
  absolute-positioned popovers. Enter/exit animations go through `features/app/useMountAnimation.ts`
  plus the `wc-pop` / `wc-dock--in|out` classes in `components.css` (all honour reduced motion).
- **Emoji** render through the `features/app/Emoji.tsx` component as same-origin Fluent assets when
  the self-hosted pack is present, falling back to the OS-native glyph otherwise. Never a remote
  emoji CDN. The component consults the pack manifest (`features/app/emojiManifest.ts`, fetched once
  from `/emoji/manifest.json`) so it only ever requests an asset that exists: static glyphs come from
  a single shared sprite via `<use href="/emoji/sprite.svg#e{codepoint}">` (one cached request for
  the whole picker, prefetched on manifest load), and animated APNGs (`/emoji/animated/{codepoint}.png`)
  are requested only for the curated codepoints that have one. Codepoint key from `lib/emojiCode.ts`.
  This avoids the old one-image-per-tile pattern and the doomed animated requests that flooded the
  network and flickered when the picker opened. Animation is **opt-in per call site** via the
  `Emoji` `animated` prop (default off) and reserved for reaction surfaces: the reaction pills and the
  reaction picker + quick-reaction row (`ReactionMenu` passes `animated` to `EmojiPicker`). Each
  reaction pill is a `ReactionPill` (`features/channel/ReactionPill.tsx`) that plays the animation for
  3s the first time it scrolls into view (message seen), then settles to the static sprite; while the
  whole pill is hovered the animation plays continuously and freezes again on mouse leave. Toggling
  `Emoji`'s `animated` flag remounts the APNG node, so a flip restarts it from frame 0. The picker
  animates while it is open. Message bodies and the composer's emoji picker stay on the static sprite.
  It is still gated by the `emojiAnimated` user setting. `:shortcodes:` resolve via `node-emoji`, in-text emoji are detected with `emoji-regex`.
  The pack is built by `scripts/build-emoji-pack.sh` (one-shot: sparse-clones the Fluent repos without
  the ~5GB, then runs `scripts/prepare-emoji.mjs`, which emits `sprite.svg` + curated `animated/*.png`
  + `manifest.json`) into `public/emoji/` (dev, gitignored) or a dir behind the API's
  `WORKCHAT_EMOJI_DIR` (prod). Fallback chain per emoji: animated (reactions, opt-in) -> static
  (sprite) -> native. Emoji picker data/keywords live in `lib/emoji.ts`.
- **User settings** live in `features/app/settings.tsx` (`SettingsProvider` + `useSettings`,
  persisted to localStorage): currently emoji animation and the simulated pack-present flag.
- **Avatars** are generated locally with DiceBear (`lib/avatar.ts`, `@dicebear/core` v10 +
  `@dicebear/styles` JSON defs), seeded by name, cached, emitted as data URIs (no remote request).
  Styles by subject: person=cameo, bot=gaze, workspace=blobs. Person/bot backgrounds are lively
  pastels chosen for face contrast and **never terracotta/red** (single brand accent rule).
- **Message text** is rendered by `features/channel/richText.tsx` (bold, italic, inline + fenced
  code, links, "- " lists, @mentions), building React nodes. The only `dangerouslySetInnerHTML` is
  highlight.js output for fenced code blocks (`highlight.js`, BSD-3, local, language auto-detect) and
  is safe because highlight.js escapes the code. The composer emits this same lightweight markdown.
  Render message bodies in a `<div>`, never a `<p>` (fenced code / lists produce `<pre>`/`<ul>`,
  which are illegal inside `<p>` and cause a hydration error). A message that is **emoji-only** (only
  emoji + whitespace, no fenced code) renders them larger, tapering with the count (1 -> 44px, 2-3 ->
  36px, 4+ -> 28px; `jumboEmojiCount`/`emojiSizeFor`). Every message emoji shows its `:shortcode:` on
  hover in a styled DS `Tooltip` (not the native `title`), the label from `shortcodeOf` (node-emoji
  `which`).
- **Message input** is a shared rich editor, `features/channel/MessageEditor.tsx`, used by both the
  channel `Composer` and the `ThreadPanel` reply box (the `ProfilePanel` bio stays a plain `Textarea`,
  it is not a message field). It is an **uncontrolled contenteditable** (`.wc-rich-input`), not a
  textarea, so it can render inline Fluent emote **chips**: picking or typing an emoji inserts a
  `contentEditable=false` span carrying `data-emoji` (built by `features/channel/composerEditor.ts`,
  static sprite). `onSend` receives the **serialised plain text** (emotes back to their Unicode glyph,
  `<br>`/blocks to `\n`), so the message pipeline and `richText` rendering are unchanged. The
  surrounding toolbar (bold/italic/code/list, emoji picker, send) drives the editor through a ref
  handle (`MessageEditorHandle`: `submit`/`insertEmoji`/`insertText`/`wrapSelection`/`prefixLines`/
  `codeFormat`). Paste is coerced to plain text; caret/offsets are mapped by serialising the range
  from the editor start to the selection focus (`editorState`).
- **Composer autocomplete** (inside `MessageEditor`): one keyboard-navigable suggestion popup serves
  both triggers, `@mention` (members) and `:shortcode:` (emoji, via `searchShortcodes` in
  `lib/shortcodes.ts`, backed by node-emoji `search`, prefix matches ranked first). A single `trigger`
  state (`kind`/`query`/`start`) plus an `active` index drives it; the editor is an ARIA `combobox`
  (`aria-activedescendant` on the options, ids namespaced per instance via `useId`). Keys: Up/Down
  move, Enter/Tab accept, Esc dismisses; hover syncs `active`, and option `onMouseDown` is prevented so
  the editor keeps focus. Picking a mention inserts `@name `, a shortcode inserts an emote chip. The
  shortcode trigger fires from the first character after the colon and only at a token start
  (`(?:^|\s):`), so times like `10:30` do not trigger it. The `Popover` (`components/ds/Popover.tsx`)
  measures before paint on every open render (and via a `ResizeObserver` for async resizes), so a
  shrinking/growing list stays anchored to the input with no stale-gap or flash.
