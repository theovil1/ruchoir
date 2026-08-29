# Self-hosted fonts

Sovereignty rule: Workchat never loads fonts from Google Fonts or any external CDN
(see `AGENTS.md`). The UI uses **IBM Plex Sans** and
**IBM Plex Mono**, both under the SIL Open Font License (OFL), served from this folder.

Place the following files here (variable woff2 preferred):

- `ibm-plex-sans-var.woff2`
- `ibm-plex-mono-var.woff2`

The `@font-face` rules in `app/globals.css` reference these paths. Until the files are
added, the app falls back to system fonts and the build still succeeds.

Source the OFL font binaries from the official IBM Plex project and commit them here
(the OFL permits redistribution). Do not fetch them at build time or runtime.
