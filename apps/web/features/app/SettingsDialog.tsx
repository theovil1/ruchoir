"use client";

import type { CSSProperties, ReactNode } from "react";
import { IconButton } from "@/components/ds";
import { Emoji } from "./Emoji";
import { useSettings, type ThemeName } from "./settings";

/** Representative swatches per theme, purely for the picker preview (fixed, not live tokens). */
const THEME_PREVIEWS: { id: ThemeName; label: string; canvas: string; chrome: string; accent: string; ink: string }[] = [
  { id: "ruchui", label: "RuchUI", canvas: "#f7f3ed", chrome: "#f0e8e0", accent: "#c65d45", ink: "#171716" },
  { id: "light", label: "Clair", canvas: "#ffffff", chrome: "#f4f5f6", accent: "#c65d45", ink: "#17181b" },
  { id: "ruchui-dark", label: "RuchUI Dark", canvas: "#143336", chrome: "#0f2629", accent: "#d07a66", ink: "#f5f3ec" },
  { id: "dark", label: "Sombre", canvas: "#1a1a1c", chrome: "#141416", accent: "#db9788", ink: "#f4f4f6" },
];

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

const sectionLabel: CSSProperties = {
  padding: "10px 16px 2px",
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: "var(--tracking-caps)",
  textTransform: "uppercase",
  color: "var(--text-subtle)",
};

function ThemePicker({ value, onChange }: { value: ThemeName; onChange: (t: ThemeName) => void }) {
  return (
    <div
      role="radiogroup"
      aria-label="Thème"
      style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, padding: "6px 16px 10px" }}
    >
      {THEME_PREVIEWS.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t.id)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: 8,
              cursor: "pointer",
              textAlign: "left",
              borderRadius: "var(--radius-md)",
              background: selected ? "var(--surface-selected)" : "var(--surface-canvas)",
              border: `1px solid ${selected ? "var(--border-accent)" : "var(--border-default)"}`,
              boxShadow: selected ? "0 0 0 1px var(--border-accent)" : "none",
              transition: "border-color var(--duration-fast) var(--ease-out)",
            }}
          >
            {/* Miniature UI: chrome strip + canvas with an accent dot and text bars. */}
            <span
              aria-hidden
              style={{
                display: "flex",
                width: 46,
                height: 34,
                flex: "none",
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
                border: "1px solid var(--border-subtle)",
                background: t.canvas,
              }}
            >
              <span style={{ width: 12, height: "100%", background: t.chrome }} />
              <span style={{ flex: 1, position: "relative", padding: 5 }}>
                <span style={{ display: "block", width: 8, height: 8, borderRadius: "var(--radius-full)", background: t.accent }} />
                <span style={{ display: "block", width: "80%", height: 3, marginTop: 4, borderRadius: 2, background: t.ink, opacity: 0.55 }} />
                <span style={{ display: "block", width: "55%", height: 3, marginTop: 3, borderRadius: 2, background: t.ink, opacity: 0.3 }} />
              </span>
            </span>
            <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)" }}>{t.label}</span>
              {selected ? (
                <span style={{ fontSize: 11, color: "var(--text-accent)" }}>Actif</span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
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
        <div style={{ padding: "8px 0", maxHeight: "min(560px, 80vh)", overflowY: "auto" }}>
          <div style={sectionLabel}>Apparence</div>
          <ThemePicker value={s.theme} onChange={(t) => s.set("theme", t)} />
          <div style={sectionLabel}>Emojis</div>
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
          {/* Dev-only: simulates the operator NOT installing the pack, to demo the native fallback.
              In production the pack presence comes from the server, so this toggle has no place there. */}
          {process.env.NODE_ENV !== "production" ? (
            <Row
              title="Pack emoji installé"
              desc="Active le pack Fluent auto-hébergé. Désactivé, les emojis reviennent au rendu natif du système."
            >
              <Toggle on={s.emojiPack} onChange={(v) => s.set("emojiPack", v)} label="Pack emoji installé" />
            </Row>
          ) : null}
        </div>
      </div>
    </div>
  );
}
