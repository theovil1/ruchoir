# AGENTS.md - packages/design-system

Ruchoir's design system as a repo package: design tokens and React components recreated
from the Claude Design handoff. See root `AGENTS.md` for project-wide rules.

## Status

Placeholder. Not implemented yet. The source handoff lives locally (and
gitignored) at `ruchoir-design-system/`: CSS tokens, React components, screen mockups,
and an oxlint adherence config.

## Principles (when work starts)

- **Two brand colors**: terracotta `#c65d45` (`--terracotta-500`), the accent, used sparingly;
  and deep teal `#18383d` (`--teal-500`) for dark surfaces only. Everything else is warm cream/sand
  neutral and desaturated semantic colors.
- Typography: IBM Plex Sans (UI, 14px body) and IBM Plex Mono (code), self-hosted (OFL).
- Recreate the mockups faithfully in React; do not copy prototype internals when they do
  not fit. Ship the oxlint adherence config so token usage is enforced.
