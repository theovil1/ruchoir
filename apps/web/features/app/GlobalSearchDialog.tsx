"use client";

import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, useMemo, useRef, useState } from "react";
import { Avatar, Dialog, EmptyState, Icon } from "@/components/ds";
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
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
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

  // Flat list of open actions, in display order (messages, then files, then people), so the arrow
  // keys move across every group. The group offsets below map a row back to its global index.
  const actions = useMemo<(() => void)[]>(
    () => [
      ...msgHits.map((it) => () => onOpenMessage(it.channelId, it.message.id)),
      ...fileHits.map(() => onOpenFile),
      ...peopleHits.map((p) => () => onOpenProfile(p.name)),
    ],
    [msgHits, fileHits, peopleHits, onOpenMessage, onOpenFile, onOpenProfile],
  );
  const fileStart = msgHits.length;
  const peopleStart = msgHits.length + fileHits.length;

  const rowStyle = (idx: number): CSSProperties => ({
    ...styles.row,
    background: idx === active ? "var(--surface-selected)" : "transparent",
  });
  const scrollTo = (i: number) => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${i}"]`)?.scrollIntoView({ block: "nearest" });
  };
  const onKeyDown = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.min(total - 1, active + 1);
      setActive(next);
      scrollTo(next);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, active - 1);
      setActive(next);
      scrollTo(next);
    } else if (e.key === "Enter") {
      e.preventDefault();
      actions[active]?.();
    }
  };

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
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
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

      <div ref={listRef} style={{ maxHeight: 360, overflow: "auto" }}>
        {!q ? (
          <EmptyState
            size="compact"
            icon="search"
            description="Tapez pour chercher dans les canaux, les fichiers et l'annuaire."
          />
        ) : total === 0 ? (
          <EmptyState size="compact" icon="search" title="Aucun résultat" description={`Rien ne correspond à « ${query} ».`} />
        ) : (
          <>
            {msgHits.length > 0 ? (
              <>
                <div style={styles.label}>Messages</div>
                {msgHits.map((it, i) => (
                  <button
                    key={`${it.channelId}:${it.message.id}`}
                    type="button"
                    className="wc-listrow"
                    data-idx={i}
                    style={rowStyle(i)}
                    onMouseMove={() => setActive(i)}
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
                {fileHits.map((f, i) => (
                  <button
                    key={f.name}
                    type="button"
                    className="wc-listrow"
                    data-idx={fileStart + i}
                    style={rowStyle(fileStart + i)}
                    onMouseMove={() => setActive(fileStart + i)}
                    onClick={onOpenFile}
                  >
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
                {peopleHits.map((p, i) => (
                  <button
                    key={p.name}
                    type="button"
                    className="wc-listrow"
                    data-idx={peopleStart + i}
                    style={rowStyle(peopleStart + i)}
                    onMouseMove={() => setActive(peopleStart + i)}
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
      {total > 0 ? (
        <div style={{ display: "flex", gap: 14, padding: "8px 2px 0", fontSize: 11, color: "var(--text-subtle)" }}>
          <span>↑ ↓ pour naviguer</span>
          <span>Entrée pour ouvrir</span>
          <span>Échap pour fermer</span>
        </div>
      ) : null}
    </Dialog>
  );
}
