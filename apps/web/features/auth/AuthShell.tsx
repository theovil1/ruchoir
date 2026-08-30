"use client";

import { type CSSProperties, type ReactNode } from "react";

const styles: Record<string, CSSProperties> = {
  root: {
    flex: 1,
    minHeight: "100%",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    padding: "40px 24px",
    background: "var(--surface-sunken)",
  },
  wordmark: {
    fontSize: 24,
    fontWeight: 600,
    letterSpacing: "-0.03em",
    color: "var(--text-strong)",
  },
  card: {
    width: "min(400px, 100%)",
    background: "var(--surface-canvas)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-lg)",
    boxShadow: "var(--shadow-dialog)",
    padding: "28px 28px 24px",
  },
  footer: { fontSize: 12, color: "var(--text-subtle)", textAlign: "center" },
};

/** Shared centered layout for the sign-in and sign-up screens: wordmark, a card, and a footer note. */
export function AuthShell({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div style={styles.root}>
      <div style={styles.wordmark}>
        Workchat<span style={{ color: "var(--terracotta-500)" }}>.</span>
      </div>
      <div style={styles.card}>{children}</div>
      {footer ? <div style={styles.footer}>{footer}</div> : null}
    </div>
  );
}
