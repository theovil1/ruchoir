"use client";

import { type CSSProperties, useMemo, useState } from "react";
import { Avatar, Dialog, Icon } from "@/components/ds";
import type { Presence } from "@/components/ds";
import type { SpaceFile } from "@/lib/data";
import type { ActivityItem } from "./activity";

const styles: Record<string, CSSProperties> = {
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "var(--tracking-caps)",
    textTransform: "uppercase",
    color: "var(--text-subtle)",
    padding: "12px 4px 4px",
  },
  row: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    width: "100%",
    padding: "8px 10px",
    border: 0,
    borderRadius: "var(--radius-md)",
    background: "transparent",
    cursor: "pointer",
    textAlign: "left",
  },
  empty: { padding: "24px 4px", textAlign: "center", fontSize: 13, color: "var(--text-subtle)" },
};

export type GlobalSearchDialogProps = {
  messages: ActivityItem[];
  files: SpaceFile[];
  people: { name: string; presence: Presence; bot?: boolean }[];
  onClose: () => void;
  onOpenMessage: (channelId: string, messageId: number) => void;
  onOpenFile: () => void;
  onOpenProfile: (name: string) => void;
};

/** Workspace-wide search across messages, files and people. */
export function GlobalSearchDialog({
  messages,
  files,
  people,
  onClose,
  onOpenMessage,
  onOpenFile,
  onOpenProfile,
}: GlobalSearchDialogProps) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();

  const msgHits = useMemo(
    () =>
      q
        ? messages
            .filter((it) => it.message.body.toLowerCase().includes(q) || it.message.author.toLowerCase().includes(q))
            .slice(0, 8)
        : [],
    [q, messages],
  );
  const fileHits = useMemo(() => (q ? files.filter((f) => f.name.toLowerCase().includes(q)).slice(0, 6) : []), [q, files]);
  const peopleHits = useMemo(
    () => (q ? people.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6) : []),
    [q, people],
  );
  const total = msgHits.length + fileHits.length + peopleHits.length;

  return (
    <Dialog title="Rechercher partout" size="md" onClose={onClose}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-md)",
          marginBottom: 4,
        }}
      >
        <Icon name="search" size={16} style={{ color: "var(--text-subtle)" }} />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher dans tout l'espace"
          placeholder="Messages, fichiers, personnes dans tout l'espace…"
          style={{
            flex: 1,
            border: 0,
            outline: "none",
            background: "none",
            fontFamily: "inherit",
            fontSize: 14,
            color: "var(--text-strong)",
          }}
        />
      </div>

      <div style={{ maxHeight: 360, overflow: "auto" }}>
        {!q ? (
          <div style={styles.empty}>Tapez pour chercher dans les canaux, les fichiers et l&apos;annuaire.</div>
        ) : total === 0 ? (
          <div style={styles.empty}>Aucun résultat pour « {query} ».</div>
        ) : (
          <>
            {msgHits.length > 0 ? (
              <>
                <div style={styles.label}>Messages</div>
                {msgHits.map((it) => (
                  <button
                    key={`${it.channelId}:${it.message.id}`}
                    type="button"
                    className="wc-listrow"
                    style={styles.row}
                    onClick={() => onOpenMessage(it.channelId, it.message.id)}
                  >
                    <Avatar name={it.message.author} size={26} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--text-strong)" }}>
                        {it.message.author}
                        <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: 6 }}>{it.label}</span>
                      </span>
                      <span
                        style={{
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                          fontSize: 13,
                          color: "var(--text-body)",
                        }}
                      >
                        {it.message.body || "(pièce jointe)"}
                      </span>
                    </span>
                  </button>
                ))}
              </>
            ) : null}

            {fileHits.length > 0 ? (
              <>
                <div style={styles.label}>Fichiers</div>
                {fileHits.map((f) => (
                  <button key={f.name} type="button" className="wc-listrow" style={styles.row} onClick={onOpenFile}>
                    <Icon name={f.kind} size={18} style={{ color: "var(--text-muted)", marginTop: 1 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 13, color: "var(--text-strong)" }}>{f.name}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {f.size} · {f.when}
                      </span>
                    </span>
                  </button>
                ))}
              </>
            ) : null}

            {peopleHits.length > 0 ? (
              <>
                <div style={styles.label}>Personnes</div>
                {peopleHits.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    className="wc-listrow"
                    style={styles.row}
                    onClick={() => onOpenProfile(p.name)}
                  >
                    <Avatar name={p.name} size={26} presence={p.presence} kind={p.bot ? "bot" : "person"} />
                    <span style={{ fontSize: 13, color: "var(--text-strong)", alignSelf: "center" }}>{p.name}</span>
                  </button>
                ))}
              </>
            ) : null}
          </>
        )}
      </div>
    </Dialog>
  );
}
