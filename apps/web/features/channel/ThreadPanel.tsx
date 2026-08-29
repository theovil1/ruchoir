"use client";

import { type CSSProperties, type KeyboardEvent, useCallback, useState } from "react";
import { Avatar, Icon, IconButton, Textarea } from "@/components/ds";
import { getCurrentUser } from "@/lib/data";
import type { Message } from "@/lib/data";

const MIN_WIDTH = 320;
const MAX_WIDTH = 720;

const styles: Record<string, CSSProperties> = {
  panel: {
    flex: "none",
    position: "relative",
    borderLeft: "1px solid var(--border-subtle)",
    background: "var(--surface-chrome)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  handle: {
    position: "absolute",
    left: -3,
    top: 0,
    bottom: 0,
    width: 6,
    cursor: "col-resize",
    zIndex: 2,
  },
  head: {
    height: "var(--topbar-height)",
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 8px 0 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-strong)" },
  scroll: { flex: 1, overflow: "auto", padding: "12px 16px" },
  reply: { display: "flex", gap: 10, padding: "8px 0" },
  name: { fontSize: 13, fontWeight: 600, color: "var(--text-strong)" },
  time: { fontSize: 12, color: "var(--text-muted)", marginLeft: 6 },
  body: { fontSize: 14, color: "var(--text-body)", lineHeight: "var(--leading-snug)", marginTop: 1 },
  count: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    margin: "12px 0",
    fontSize: 12,
    color: "var(--text-subtle)",
  },
  countLine: { flex: 1, height: 1, background: "var(--border-subtle)" },
  composer: {
    flex: "none",
    borderTop: "1px solid var(--border-subtle)",
    padding: 12,
  },
  composerBox: {
    border: "1px solid var(--border-default)",
    borderRadius: "var(--radius-lg)",
    background: "var(--surface-canvas)",
    padding: "8px 10px",
  },
};

type Reply = { id: number; author: string; time: string; body: string };

const SEED_REPLIES: Reply[] = [
  { id: 1, author: "Camille Roussel", time: "09:44", body: "Oui, je te confirme les deux lignes cet après-midi." },
  { id: 2, author: "Yanis Berthier", time: "09:46", body: "Parfait, je bloque un créneau pour le rapprochement." },
];

function ReplyRow({ r }: { r: Reply }) {
  return (
    <div style={styles.reply}>
      <Avatar name={r.author} size={26} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div>
          <span style={styles.name}>{r.author}</span>
          <span style={styles.time}>{r.time}</span>
        </div>
        <p style={styles.body}>{r.body}</p>
      </div>
    </div>
  );
}

export type ThreadPanelProps = {
  parent: Message;
  onClose: () => void;
};

/** Right-hand thread view for a message's replies. Replies are simulated in local state. */
export function ThreadPanel({ parent, onClose }: ThreadPanelProps) {
  const me = getCurrentUser().name;
  const [replies, setReplies] = useState<Reply[]>(SEED_REPLIES);
  const [val, setVal] = useState("");
  const [width, setWidth] = useState(420);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth - (ev.clientX - startX)));
      setWidth(next);
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [width]);

  const send = () => {
    if (!val.trim()) return;
    setReplies((prev) => [
      ...prev,
      {
        id: Date.now(),
        author: me,
        time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
        body: val.trim(),
      },
    ]);
    setVal("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div style={{ ...styles.panel, width }}>
      <div style={styles.handle} onMouseDown={startResize} role="separator" aria-orientation="vertical" />
      <div style={styles.head}>
        <span style={styles.title}>Fil de discussion</span>
        <IconButton icon="x" label="Fermer le fil" size="sm" onClick={onClose} />
      </div>
      <div style={styles.scroll}>
        <ReplyRow r={{ id: parent.id, author: parent.author, time: parent.time, body: parent.body }} />
        <div style={styles.count}>
          <span style={styles.countLine} />
          {replies.length} réponses
          <span style={styles.countLine} />
        </div>
        {replies.map((r) => (
          <ReplyRow key={r.id} r={r} />
        ))}
      </div>
      <div style={styles.composer}>
        <div style={styles.composerBox}>
          <Textarea
            seamless
            rows={2}
            value={val}
            placeholder="Répondre dans le fil"
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 4 }}>
            <IconButton icon="send" label="Envoyer" variant="accent" size="sm" onClick={send} />
          </div>
        </div>
      </div>
    </div>
  );
}
