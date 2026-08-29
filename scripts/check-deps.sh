#!/usr/bin/env bash
# Dependency freshness and security sweep.
#
# Reports outdated and vulnerable dependencies across the Rust and JS ecosystems. This is
# the on-demand deep check backing the local dep-freshness guardrail; CI runs the audit
# parts on every push. It never modifies anything.
#
# Optional tools (skipped with a hint if missing):
#   cargo install cargo-outdated cargo-audit
set -uo pipefail

section() { printf '\n\033[1m== %s ==\033[0m\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

section "Rust: outdated crates"
if have cargo-outdated; then cargo outdated -w || true; else echo "skip: install cargo-outdated"; fi

section "Rust: security advisories"
if have cargo-audit; then cargo audit || true; else echo "skip: install cargo-audit"; fi

section "JS: outdated packages"
if have pnpm; then pnpm -r outdated || true; else echo "skip: pnpm not found"; fi

section "JS: security advisories"
if have pnpm; then pnpm -r audit || true; else echo "skip: pnpm not found"; fi

echo
echo "Done. Bump anything stale, verifying the latest STABLE version against the registry."
