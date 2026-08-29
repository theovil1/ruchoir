"use client";

import { type ChangeEvent, type CSSProperties, type KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Avatar, IconButton, Popover, Textarea } from "@/components/ds";
import { getChannelMembers } from "@/lib/data";
import type { Toast } from "../app/types";
import { EmojiPicker } from "./EmojiPicker";

const styles: Record<string, CSSProperties> = {
  wrap: { flex: "none", padding: "8px 24px 20px" },
  composer: {
    maxWidth: "var(--channel-measure)",
    margin: "0 auto",
    border: "1px solid var(--border-default)",
    borderRadius: "var(--radius-lg)",
    background: "var(--surface-canvas)",
    padding: "10px 12px 8px",
    transition: "border-color var(--duration-fast) var(--ease-out)",
  },
  tools: { display: "flex", alignItems: "center", gap: 2, marginTop: 6 },
  hint: {
    maxWidth: "var(--channel-measure)",
    margin: "6px auto 0",
    fontSize: 12,
    color: "var(--text-subtle)",
  },
};

export type ComposerProps = {
  channelName: string;
  onSend: (text: string) => void;
  onNotify: (toast: Toast) => void;
};

/** Message composer with a working formatting toolbar. Simulated send (no network). */
export function Composer({ channelName, onSend, onNotify }: ComposerProps) {
  const [val, setVal] = useState("");
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const emojiRef = useRef<HTMLButtonElement>(null);

  // Grow the composer with its content, up to a cap (then scroll).
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const h = Math.max(40, Math.min(ta.scrollHeight, 220));
    ta.style.height = `${h}px`;
    ta.style.overflowY = ta.scrollHeight > 220 ? "auto" : "hidden";
  }, [val]);

  const members = useMemo(() => getChannelMembers(), []);
  const mentionHits = useMemo(() => {
    if (!mention) return [];
    const q = mention.query.toLowerCase();
    return members.filter((m) => m.name.toLowerCase().includes(q)).slice(0, 6);
  }, [mention, members]);
  const mentionOpen = mention != null && mentionHits.length > 0;

  const send = () => {
    if (val.trim()) {
      onSend(val.replace(/\s+$/, ""));
      setVal("");
      setMention(null);
    }
  };

  /** Detect a `@partial` being typed right before the caret. */
  const detectMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = /(?:^|\s)@([\p{L}\p{N}_'-]*)$/u.exec(before);
    if (m) setMention({ query: m[1], start: caret - m[1].length - 1 });
    else setMention(null);
  };

  const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setVal(e.target.value);
    detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
  };

  const pickMention = (name: string) => {
    if (!mention) return;
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? val.length;
    const next = `${val.slice(0, mention.start)}@${name} ${val.slice(caret)}`;
    setVal(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + name.length + 2;
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      pickMention(mentionHits[0].name);
      return;
    }
    if (mentionOpen && e.key === "Escape") {
      e.preventDefault();
      setMention(null);
      return;
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  /** Wrap the current selection with markers (or insert them at the cursor). */
  const wrap = (before: string, after = before) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const next = val.slice(0, s) + before + val.slice(s, e) + after + val.slice(e);
    setVal(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(s + before.length, e + before.length);
    });
  };

  /** Prefix each selected line (used for lists). */
  const prefixLines = (prefix: string) => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const lineStart = val.lastIndexOf("\n", s - 1) + 1;
    const block = val.slice(lineStart, e);
    const replaced = block
      .split("\n")
      .map((l) => prefix + l)
      .join("\n");
    const next = val.slice(0, lineStart) + replaced + val.slice(e);
    setVal(next);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(lineStart, lineStart + replaced.length);
    });
  };

  /** Inline `code` for a single-line selection, a fenced ``` block for a multi-line one. */
  const codeFormat = () => {
    const ta = taRef.current;
    if (!ta) return;
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const sel = val.slice(s, e);
    if (sel.includes("\n")) {
      const next = `${val.slice(0, s)}\`\`\`\n${sel}\n\`\`\`${val.slice(e)}`;
      setVal(next);
      requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(s + 4, s + 4 + sel.length);
      });
    } else {
      wrap("`");
    }
  };

  const insert = (text: string) => {
    const ta = taRef.current;
    if (!ta) {
      setVal((v) => v + text);
      return;
    }
    const s = ta.selectionStart;
    const e = ta.selectionEnd;
    const next = val.slice(0, s) + text + val.slice(e);
    setVal(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = s + text.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.composer}>
        <Textarea
          ref={taRef}
          seamless
          rows={2}
          value={val}
          placeholder={`Écrire dans #${channelName}`}
          onChange={onChange}
          onKeyDown={onKeyDown}
        />
        <Popover anchorRef={taRef} open={mentionOpen} onClose={() => setMention(null)} placement="top" align="start">
          <div style={{ minWidth: 220, padding: 4, background: "var(--surface-canvas)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-popover)" }} role="listbox">
            {mentionHits.map((m, idx) => (
              <button
                key={m.name}
                type="button"
                onClick={() => pickMention(m.name)}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 8px", border: 0, borderRadius: "var(--radius-sm)", background: idx === 0 ? "var(--surface-hover)" : "transparent", cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--text-body)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = idx === 0 ? "var(--surface-hover)" : "transparent")}
              >
                <Avatar name={m.name} size={22} presence={m.presence} kind={m.bot ? "bot" : "person"} shape={m.bot ? "round" : "square"} />
                {m.name}
              </button>
            ))}
          </div>
        </Popover>
        <div style={styles.tools}>
          <IconButton icon="bold" label="Gras" size="sm" onClick={() => wrap("**")} />
          <IconButton icon="italic" label="Italique" size="sm" onClick={() => wrap("_")} />
          <IconButton icon="code" label="Code" size="sm" onClick={codeFormat} />
          <IconButton icon="list" label="Liste" size="sm" onClick={() => prefixLines("- ")} />
          <span style={{ width: 1, height: 18, background: "var(--border-subtle)", margin: "0 6px" }} />
          <IconButton
            icon="paperclip"
            label="Joindre un fichier"
            size="sm"
            onClick={() => onNotify({ tone: "info", title: "Pièce jointe", description: "Téléversement à venir dans un prochain lot." })}
          />
          <IconButton icon="at-sign" label="Mentionner" size="sm" onClick={() => insert("@")} />
          <IconButton
            ref={emojiRef}
            icon="smile"
            label="Émoji"
            size="sm"
            aria-expanded={emojiOpen}
            onClick={() => setEmojiOpen((o) => !o)}
          />
          <Popover anchorRef={emojiRef} open={emojiOpen} onClose={() => setEmojiOpen(false)} placement="top" align="start">
            <EmojiPicker
              onPick={(emoji) => {
                insert(emoji);
                setEmojiOpen(false);
              }}
            />
          </Popover>
          <div style={{ flex: 1 }} />
          <IconButton icon="send" label="Envoyer" variant="accent" size="lg" onClick={send} />
        </div>
      </div>
      <div style={styles.hint}>Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne</div>
    </div>
  );
}
