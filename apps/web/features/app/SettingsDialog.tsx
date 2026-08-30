"use client";

import type { CSSProperties, ReactNode } from "react";
import { IconButton } from "@/components/ds";
import { Emoji } from "./Emoji";
import { useSettings } from "./settings";

const scrim: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 90,
  background: "var(--scrim)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 24,
};

const dialog: CSSProperties = {
  width: "min(480px, 96vw)",
  background: "var(--surface-canvas)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-lg)",
  boxShadow: "var(--shadow-dialog)",
  overflow: "hidden",
};

const head: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  height: "var(--topbar-height)",
  padding: "0 8px 0 16px",
  borderBottom: "1px solid var(--border-subtle)",
};

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "12px 16px",
};

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        width: 38,
        height: 22,
        flex: "none",
        borderRadius: "var(--radius-full)",
        border: 0,
        cursor: "pointer",
        background: on ? "var(--terracotta-500)" : "var(--grey-300)",
        position: "relative",
        transition: "background-color var(--duration-fast) var(--ease-out)",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 18,
          height: 18,
          borderRadius: "var(--radius-full)",
          background: "var(--grey-0)",
          transition: "left var(--duration-fast) var(--ease-out)",
        }}
      />
    </button>
  );
}

function Row({ title, desc, children }: { title: ReactNode; desc?: string; children: ReactNode }) {
  return (
    <div style={row}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--text-strong)" }}>{title}</div>
        {desc ? <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>{desc}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const s = useSettings();
  return (
    <div style={scrim} onClick={onClose} role="dialog" aria-modal="true" aria-label="Préférences">
      <div style={dialog} onClick={(e) => e.stopPropagation()}>
        <div style={head}>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--text-strong)" }}>Préférences</span>
          <IconButton icon="x" label="Fermer" size="sm" onClick={onClose} />
        </div>
        <div style={{ padding: "8px 0" }}>
          <div style={{ padding: "10px 16px 2px", fontSize: 11, fontWeight: 600, letterSpacing: "var(--tracking-caps)", textTransform: "uppercase", color: "var(--text-subtle)" }}>
            Emojis
          </div>
          <Row
            title={
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                Emojis animés <Emoji emoji="🎉" size={18} />
              </span>
            }
            desc="Anime les emojis Fluent des réactions (quand le pack est installé). Ailleurs, ils restent statiques."
          >
            <Toggle on={s.emojiAnimated} onChange={(v) => s.set("emojiAnimated", v)} label="Emojis animés" />
          </Row>
          <Row
            title="Pack emoji installé"
            desc="Active le pack Fluent auto-hébergé. Désactivé, les emojis reviennent au rendu natif du système."
          >
            <Toggle on={s.emojiPack} onChange={(v) => s.set("emojiPack", v)} label="Pack emoji installé" />
          </Row>
        </div>
      </div>
    </div>
  );
}
