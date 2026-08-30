"use client";

import { type CSSProperties, useRef, useState } from "react";
import { IconButton, Popover } from "@/components/ds";
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
};

export type ComposerProps = {
  channelName: string;
  onSend: (text: string) => void;
  onNotify: (toast: Toast) => void;
};

/** Message composer with a working formatting toolbar. Simulated send (no network). */
export function Composer({ channelName, onSend, onNotify }: ComposerProps) {
  const [emojiOpen, setEmojiOpen] = useState(false);
  const editorRef = useRef<MessageEditorHandle>(null);
  const emojiRef = useRef<HTMLButtonElement>(null);

  return (
    <div style={styles.wrap}>
      <div style={styles.composer}>
        <MessageEditor ref={editorRef} placeholder={`Écrire dans #${channelName}`} onSend={onSend} />
        <div style={styles.tools}>
          <IconButton icon="bold" label="Gras" size="sm" onClick={() => editorRef.current?.wrapSelection("**")} />
          <IconButton icon="italic" label="Italique" size="sm" onClick={() => editorRef.current?.wrapSelection("_")} />
          <IconButton icon="code" label="Code" size="sm" onClick={() => editorRef.current?.codeFormat()} />
          <IconButton icon="list" label="Liste" size="sm" onClick={() => editorRef.current?.prefixLines("- ")} />
          <span style={{ width: 1, height: 18, background: "var(--border-subtle)", margin: "0 6px" }} />
          <IconButton
            icon="paperclip"
            label="Joindre un fichier"
            size="sm"
            onClick={() => onNotify({ tone: "info", title: "Pièce jointe", description: "Téléversement à venir dans un prochain lot." })}
          />
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
          <IconButton icon="send" label="Envoyer" variant="accent" size="lg" onClick={() => editorRef.current?.submit()} />
        </div>
      </div>
      <div style={styles.hint}>Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne</div>
    </div>
  );
}
