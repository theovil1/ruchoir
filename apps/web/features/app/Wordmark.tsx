import type { CSSProperties } from "react";

const bar: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  height: "var(--topbar-height)",
  flex: "none",
  padding: "0 12px",
  borderBottom: "1px solid var(--border-subtle)",
};

const dot: CSSProperties = {
  width: 9,
  height: 9,
  flex: "none",
  borderRadius: "var(--radius-full)",
  background: "var(--terracotta-500)",
};

const name: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 16,
  fontWeight: 600,
  letterSpacing: "var(--tracking-display)",
  color: "var(--text-strong)",
};

/**
 * Product wordmark. The design system ships no logo yet: the brand is provisional and the name
 * is set in type, preceded by a terracotta dot (no icon) until a real logo lands.
 */
export function Wordmark() {
  return (
    <div style={bar}>
      <span style={dot} aria-hidden />
      <span style={name}>Workchat</span>
    </div>
  );
}
