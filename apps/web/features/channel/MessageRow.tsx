"use client";

import { type CSSProperties, useRef, useState } from "react";
import { Avatar, Card, Icon, IconButton, Popover, Tag } from "@/components/ds";
import { getCurrentUser, getMentionNames, getPresence } from "@/lib/data";
import type { Message } from "@/lib/data";
import { Emoji } from "../app/Emoji";
import { UserProfileCard } from "../app/UserProfileCard";
import { renderRichText } from "./richText";
import { InlineImage } from "./InlineImage";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { MessageMenu } from "./MessageMenu";
import { ReactionMenu } from "./ReactionMenu";
import { ReadReceipt } from "./ReadReceipt";

/** Everything a message row can do. Grouped to keep the prop surface readable. */
export type MessageActions = {
  onReact: (emoji: string) => void;
  onOpenThread: () => void;
  onToggleSave: () => void;
  onEdit: () => void;
  onTogglePin: () => void;
  onCopyLink: () => void;
  onCopyMessage: () => void;
  onMarkUnread: () => void;
  onDelete: () => void;
  onOpenProfile: () => void;
  onEditProfile: () => void;
  onMessage: () => void;
};

const styles: Record<string, CSSProperties> = {
  msg: {
    display: "flex",
    gap: 14,
    // Bottom padding reserves room for the hover read receipt so it never overlaps content.
    padding: "6px 8px 18px",
    margin: "0 -8px",
    borderRadius: "var(--radius-md)",
    position: "relative",
    transition: "background-color var(--duration-fast) var(--ease-out)",
  },
  author: { display: "flex", alignItems: "baseline", gap: 8 },
  name: { fontSize: 14, fontWeight: 600, color: "var(--text-strong)" },
  time: { fontSize: 13, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" },
  body: {
    fontSize: 16,
    lineHeight: "var(--leading-normal)",
    color: "var(--text-body)",
    marginTop: 1,
    whiteSpace: "pre-wrap",
    overflowWrap: "anywhere",
  },
  edited: { marginLeft: 6, fontSize: 12, color: "var(--text-subtle)" },
  actions: {
    position: "absolute",
    top: -14,
    right: 8,
    display: "flex",
    gap: 2,
    padding: 2,
    background: "var(--surface-canvas)",
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-md)",
    boxShadow: "var(--shadow-popover)",
  },
  receipt: {
    position: "absolute",
    right: 12,
    bottom: 6,
    pointerEvents: "none",
  },
};

function reactionPill(mine?: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    height: 26,
    padding: "0 9px",
    border: `1px solid ${mine ? "var(--terracotta-400)" : "var(--border-default)"}`,
    background: mine ? "var(--terracotta-50)" : "var(--surface-canvas)",
    borderRadius: "var(--radius-full)",
    fontSize: 13,
    color: mine ? "var(--terracotta-800)" : "var(--text-muted)",
    cursor: "pointer",
    fontVariantNumeric: "tabular-nums",
    transition: "background-color var(--duration-fast) var(--ease-out), border-color var(--duration-fast) var(--ease-out)",
  };
}

export type MessageRowProps = { m: Message; actions: MessageActions };

const avatarBtn: CSSProperties = {
  border: 0,
  background: "none",
  padding: 0,
  cursor: "pointer",
  flex: "none",
  alignSelf: "flex-start",
};

const nameBtn: CSSProperties = {
  border: 0,
  background: "none",
  padding: 0,
  cursor: "pointer",
  fontFamily: "var(--font-sans)",
  fontSize: 14,
  fontWeight: 600,
  color: "var(--text-strong)",
};

export function MessageRow({ m, actions }: MessageRowProps) {
  const [hover, setHover] = useState(false);
  const [reactOpen, setReactOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const avatarRef = useRef<HTMLButtonElement>(null);
  const deleted = m.deleted;
  const isOwn = m.author === getCurrentUser().name;
  const showActions = (hover || reactOpen || menuOpen) && !deleted;

  const openProfileFromCard = () => {
    setProfileOpen(false);
    actions.onOpenProfile();
  };
  const editProfileFromCard = () => {
    setProfileOpen(false);
    actions.onEditProfile();
  };
  const messageFromCard = () => {
    setProfileOpen(false);
    actions.onMessage();
  };

  return (
    <div
      data-mid={m.id}
      style={{ ...styles.msg, background: hover && !deleted ? "var(--surface-hover)" : "transparent" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <button ref={avatarRef} style={avatarBtn} onClick={() => setProfileOpen((o) => !o)} aria-label={`Profil de ${m.author}`}>
        <Avatar name={m.author} size={34} presence={m.kind === "system" ? undefined : getPresence(m.author)} />
      </button>
      <Popover anchorRef={avatarRef} open={profileOpen} onClose={() => setProfileOpen(false)} placement="bottom" align="start">
        <UserProfileCard name={m.author} onViewFull={openProfileFromCard} onEditProfile={editProfileFromCard} onMessage={messageFromCard} />
      </Popover>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={styles.author}>
          <button style={nameBtn} onClick={() => setProfileOpen(true)}>
            {m.author}
          </button>
          <span style={styles.time}>{m.time}</span>
          {m.imported ? <Tag icon="import">Importé de Slack</Tag> : null}
          {m.pinned ? (
            <Tag icon="pin" tone="accent">
              Épinglé
            </Tag>
          ) : null}
          {m.saved ? (
            <Tag icon="bookmark" tone="accent">
              Enregistré
            </Tag>
          ) : null}
        </div>

        {deleted ? (
          <p
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 14,
              fontStyle: "italic",
              color: "var(--text-subtle)",
              marginTop: 1,
            }}
          >
            <Icon name="trash-2" size={14} />
            Message supprimé
          </p>
        ) : (
          <>
            {m.body ? (
              <div style={styles.body}>
                {renderRichText(m.body, getMentionNames(), isOwn)}
                {m.edited ? <span style={styles.edited}>(modifié)</span> : null}
              </div>
            ) : null}

            {m.link ? <LinkPreviewCard link={m.link} /> : null}
            {m.image ? <InlineImage image={m.image} /> : null}

            {m.attachment ? (
              <div style={{ marginTop: 8, maxWidth: 360 }}>
                <Card
                  variant="interactive"
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px" }}
                >
                  <Icon name={m.attachment.kind} size={18} style={{ color: "var(--text-muted)" }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, fontWeight: 500, color: "var(--text-strong)" }}>
                      {m.attachment.name}
                    </span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                      {m.attachment.size}
                    </span>
                  </span>
                  <IconButton icon="download" label="Télécharger" size="sm" />
                </Card>
              </div>
            ) : null}

            {m.reactions && m.reactions.length > 0 ? (
              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                {m.reactions.map((r) => (
                  <button
                    key={r.emoji}
                    style={reactionPill(r.mine)}
                    onClick={() => actions.onReact(r.emoji)}
                    aria-pressed={r.mine}
                    aria-label={`Réaction ${r.emoji}, ${r.count}`}
                  >
                    <Emoji emoji={r.emoji} size={16} />
                    {r.count}
                  </button>
                ))}
                <ReactionMenu variant="pill" onPick={actions.onReact} />
              </div>
            ) : null}

            {m.replies ? (
              <button
                onClick={actions.onOpenThread}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 8,
                  border: 0,
                  background: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: "var(--font-sans)",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--text-link)",
                }}
              >
                <Icon name="message-square" size={14} />
                {m.replies} réponses
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>· dernière il y a 12 min</span>
              </button>
            ) : null}
          </>
        )}
      </div>

      {hover && !deleted ? (
        <div style={styles.receipt}>
          <ReadReceipt names={m.readBy} />
        </div>
      ) : null}

      {showActions ? (
        <div style={styles.actions}>
          <ReactionMenu variant="action" onPick={actions.onReact} onOpenChange={setReactOpen} />
          <IconButton icon="message-square" label="Répondre dans un fil" size="sm" onClick={actions.onOpenThread} />
          {isOwn ? <IconButton icon="square-pen" label="Modifier" size="sm" onClick={actions.onEdit} /> : null}
          <IconButton
            icon="bookmark"
            label={m.saved ? "Retirer des enregistrés" : "Enregistrer"}
            size="sm"
            aria-pressed={m.saved}
            onClick={actions.onToggleSave}
          />
          <MessageMenu
            pinned={m.pinned}
            own={isOwn}
            sentAt={`aujourd'hui à ${m.time}`}
            onEdit={actions.onEdit}
            onCopyMessage={actions.onCopyMessage}
            onCopyLink={actions.onCopyLink}
            onTogglePin={actions.onTogglePin}
            onMarkUnread={actions.onMarkUnread}
            onDelete={actions.onDelete}
            onOpenChange={setMenuOpen}
          />
        </div>
      ) : null}
    </div>
  );
}
