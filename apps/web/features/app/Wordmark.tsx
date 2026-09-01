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

const mark: CSSProperties = { width: 22, height: 22, flex: "none", display: "block" };

const name: CSSProperties = {
  fontFamily: "var(--font-sans)",
  fontSize: 16,
  fontWeight: 600,
  letterSpacing: "var(--tracking-display)",
  color: "var(--text-strong)",
};

/** Product wordmark: the Ruchoir mark (public/brand/ruchoir-mark.png) followed by the name in type. */
export function Wordmark() {
  return (
    <div style={bar}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/ruchoir-mark.png" alt="" style={mark} />
      <span style={name}>Ruchoir</span>
    </div>
  );
}
