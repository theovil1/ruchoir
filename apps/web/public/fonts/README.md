# Self-hosted fonts

Sovereignty rule: Workchat never loads fonts from Google Fonts or any external CDN
(see `AGENTS.md`). The UI uses **IBM Plex Sans** and **IBM Plex Mono**, both under the SIL Open
Font License (OFL, see `OFL.txt`), served from this folder.

The committed woff2 files are the **latin subset**, static per weight. The latin subset covers
French in full (all accented letters live in Latin-1), which keeps the payload small:

- `ibm-plex-sans-latin-{400,500,600,700}-normal.woff2`
- `ibm-plex-mono-latin-{400,500,600}-normal.woff2`

The matching `@font-face` rules are in `app/globals.css` (one per weight). Add a weight or the
`latin-ext` subset only if a glyph turns up missing.

Provenance: the OFL binaries as repackaged by Fontsource's `@fontsource/ibm-plex-sans` and
`@fontsource/ibm-plex-mono` (identical to the official IBM Plex release). The OFL permits
redistribution, so these are committed directly. Do not fetch fonts at build time or runtime.
