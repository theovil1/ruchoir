"use client";

import { type CSSProperties, useRef, useState } from "react";
import { Icon, IconButton, Popover } from "@/components/ds";
import type { MessageAttachment } from "@/lib/data";
import type { Toast } from "../app/types";
import { EmojiPicker } from "./EmojiPicker";
import { MessageEditor, type MessageEditorHandle } from "./MessageEditor";

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
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 8px 6px 10px",
    marginBottom: 8,
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-md)",
    background: "var(--surface-sunken)",
    fontSize: 13,
    color: "var(--text-body)",
  },
};

/** Format a byte count into a French-formatted size string. */
function bytesToSize(bytes: number): string {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.max(1, Math.round(bytes / 1e3))} Ko`;
}

function iconForType(type: string): string {
  if (type.includes("spreadsheet") || type.includes("csv")) return "file-spreadsheet";
  if (type.startsWith("text")) return "file-text";
  if (type.startsWith("image")) return "image";
  return "file";
}

export type ComposerProps = {
  channelName: string;
  onSend: (text: string, attachment?: MessageAttachment) => void;
  onNotify: (toast: Toast) => void;
};

/** Message composer with a working formatting toolbar and file attachment. Simulated send (no network). */
export function Composer({ channelName, onSend, onNotify }: ComposerProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [pending, setPending] = useState<MessageAttachment | null>(null);
  const editorRef = useRef<MessageEditorHandle>(null);
  const emojiRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const sendWith = (text: string) => {
    onSend(text, pending ?? undefined);
    setPending(null);
  };

  const clickSend = () => {
    const ed = editorRef.current;
    if (!ed) return;
    if (pending && ed.isEmpty()) {
      onSend("", pending);
      setPending(null);
      ed.clear();
      ed.focus();
      return;
    }
    ed.submit();
  };

  const onFilePicked = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    setPending({ name: file.name, size: bytesToSize(file.size), kind: iconForType(file.type) });
    onNotify({ tone: "info", title: "Pièce jointe prête", description: file.name });
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.composer}>
        {pending ? (
          <div style={styles.chip}>
            <Icon name={pending.kind} size={16} style={{ color: "var(--text-muted)" }} />
            <span style={{ fontWeight: 500, color: "var(--text-strong)" }}>{pending.name}</span>
            <span style={{ color: "var(--text-subtle)" }}>{pending.size}</span>
            <IconButton icon="x" label="Retirer la pièce jointe" size="sm" onClick={() => setPending(null)} />
          </div>
        ) : null}
        <MessageEditor ref={editorRef} placeholder={`Écrire dans #${channelName}`} onSend={sendWith} />
        <div style={styles.tools}>
          <IconButton icon="bold" label="Gras" size="sm" onClick={() => editorRef.current?.wrapSelection("**")} />
          <IconButton icon="italic" label="Italique" size="sm" onClick={() => editorRef.current?.wrapSelection("_")} />
          <IconButton icon="code" label="Code" size="sm" onClick={() => editorRef.current?.codeFormat()} />
          <IconButton icon="list" label="Liste" size="sm" onClick={() => editorRef.current?.prefixLines("- ")} />
          <span style={{ width: 1, height: 18, background: "var(--border-subtle)", margin: "0 6px" }} />
          <IconButton icon="paperclip" label="Joindre un fichier" size="sm" onClick={() => fileRef.current?.click()} />
          <input ref={fileRef} type="file" style={{ display: "none" }} onChange={(e) => onFilePicked(e.target.files)} />
          <IconButton icon="at-sign" label="Mentionner" size="sm" onClick={() => editorRef.current?.insertText("@")} />
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
                editorRef.current?.insertEmoji(emoji);
                setEmojiOpen(false);
              }}
            />
          </Popover>
          <div style={{ flex: 1 }} />
          <IconButton icon="send" label="Envoyer" variant="accent" size="lg" onClick={clickSend} />
        </div>
      </div>
      <div style={styles.hint}>Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne</div>
    </div>
  );
}
