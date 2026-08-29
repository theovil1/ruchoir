"use client";

import { type CSSProperties, Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { Icon, IconButton, Tooltip } from "@/components/ds";
import { getDirectMessages, getSpaceFiles, getTypingUsers } from "@/lib/data";
import type { Channel, Message } from "@/lib/data";
import { useMountAnimation } from "../app/useMountAnimation";
import { ProfilePanel } from "./ProfilePanel";
import type { ChannelPanel, Toast } from "../app/types";
import { ChannelMenu } from "./ChannelMenu";
import { SearchPanel } from "./SearchPanel";
import { type ChannelMember, SidePanel } from "./SidePanel";
import { Composer } from "./Composer";
import { MessageRow } from "./MessageRow";
import { SystemMessage } from "./SystemMessage";
import { ThreadPanel } from "./ThreadPanel";
import { TypingIndicator } from "./TypingIndicator";

/** Right-hand dock: animates in/out, stays mounted during exit, and cross-fades on content switch. */
function RightDock({ open, contentKey, children }: { open: boolean; contentKey: string; children: ReactNode }) {
  const { mounted, closing } = useMountAnimation(open, 200);
  const last = useRef<ReactNode>(null);
  const lastKey = useRef("");
  if (open) {
    last.current = children;
    lastKey.current = contentKey;
  }
  if (!mounted) return null;
  return (
    <div style={{ display: "flex", flex: "none" }} className={closing ? "wc-dock--out" : "wc-dock--in"}>
      <div key={open ? contentKey : lastKey.current} className="wc-dock-content" style={{ display: "flex" }}>
        {open ? children : last.current}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  top: {
    height: "var(--topbar-height)",
    flex: "none",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 12px 0 16px",
    borderBottom: "1px solid var(--border-subtle)",
    background: "var(--alpha-paper-90)",
    backdropFilter: "blur(6px)",
  },
  title: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: "var(--tracking-tight)",
    color: "var(--text-strong)",
  },
  meta: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)" },
  feed: { flex: 1, overflow: "auto", padding: "20px 0 8px" },
  inner: { maxWidth: "var(--channel-measure)", margin: "0 auto", padding: "0 24px" },
  day: { display: "flex", alignItems: "center", gap: 12, margin: "18px 0" },
  dayLine: { flex: 1, height: 1, background: "var(--border-subtle)" },
  dayLbl: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "var(--tracking-caps)",
    textTransform: "uppercase",
    color: "var(--text-subtle)",
  },
  unread: { display: "flex", alignItems: "center", gap: 10, margin: "10px 0" },
  unreadLine: { flex: 1, height: 1, background: "var(--terracotta-400)" },
  unreadLabel: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "var(--tracking-caps)",
    textTransform: "uppercase",
    color: "var(--terracotta-700)",
  },
};

/** Extra members shown alongside the DM participants, matching the kit's member list. */
const EXTRA_MEMBERS: ChannelMember[] = [
  { id: "x", name: "Marc Lévêque", presence: "offline" },
  { id: "y", name: "Sofia Nadir", presence: "online" },
];

/** Message-action handlers, each taking the target message id. Built in AppRoot. */
export type MessageActionHandlers = {
  react: (messageId: number, emoji: string) => void;
  openThread: (messageId: number) => void;
  toggleSave: (messageId: number) => void;
  edit: (messageId: number) => void;
  togglePin: (messageId: number) => void;
  copyLink: (messageId: number) => void;
  copyMessage: (messageId: number) => void;
  markUnread: (messageId: number) => void;
  remove: (messageId: number) => void;
  openProfile: (name: string) => void;
  editProfile: (name: string) => void;
  message: (name: string) => void;
};

export type ChannelScreenProps = {
  channel: Channel;
  messages: Message[];
  panel: ChannelPanel;
  threadId: number | null;
  profileName: string | null;
  profileEditing: boolean;
  unreadMarker: number | null;
  onSend: (text: string) => void;
  onPanel: (panel: ChannelPanel) => void;
  onCloseThread: () => void;
  onCloseProfile: () => void;
  onNotify: (toast: Toast) => void;
  actions: MessageActionHandlers;
};

/** The channel view: header, message feed, composer, and optional right panel. */
export function ChannelScreen({
  channel,
  messages,
  panel,
  threadId,
  profileName,
  profileEditing,
  unreadMarker,
  onSend,
  onPanel,
  onCloseThread,
  onCloseProfile,
  onNotify,
  actions,
}: ChannelScreenProps) {
  const members: ChannelMember[] = [...getDirectMessages(), ...EXTRA_MEMBERS];
  const threadParent = threadId != null ? messages.find((m) => m.id === threadId) : undefined;
  const pinned = messages.filter((m) => m.pinned && !m.deleted);
  const togglePanel = (p: Exclude<ChannelPanel, null>) => onPanel(panel === p ? null : p);

  const feedRef = useRef<HTMLDivElement>(null);
  const msgCount = messages.length;
  // Land at the latest message when entering a channel, and follow new messages.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [channel.id, msgCount]);

  const [highlightFile, setHighlightFile] = useState<string | null>(null);
  const jumpToFile = (fileName: string) => {
    onPanel("files");
    setHighlightFile(fileName);
  };

  const jumpToMessage = (id: number) => {
    const el = feedRef.current?.querySelector<HTMLElement>(`[data-mid="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.remove("wc-flash");
    // Re-trigger the flash animation.
    void el.offsetWidth;
    el.classList.add("wc-flash");
  };

  const files = getSpaceFiles();
  const contentKey = profileName
    ? `profile:${profileName}`
    : threadParent
      ? `thread:${threadParent.id}`
      : panel
        ? `panel:${panel}`
        : "";
  const rightNode: ReactNode = profileName ? (
    <ProfilePanel
      name={profileName}
      startEditing={profileEditing}
      onClose={onCloseProfile}
      onMessage={() => actions.message(profileName)}
      onNotify={onNotify}
    />
  ) : threadParent ? (
    <ThreadPanel parent={threadParent} onClose={onCloseThread} />
  ) : panel === "search" ? (
    <SearchPanel
      messages={messages}
      files={files}
      onClose={() => onPanel(null)}
      onJump={jumpToMessage}
      onJumpFile={jumpToFile}
    />
  ) : panel ? (
    <SidePanel
      kind={panel}
      files={files}
      members={members}
      pinned={pinned}
      highlightFile={highlightFile}
      onClose={() => onPanel(null)}
      onSelectMember={actions.openProfile}
      onJump={jumpToMessage}
      onNotify={onNotify}
    />
  ) : null;
  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={styles.top}>
          <div style={styles.title}>
            <Icon name={channel.type === "private" ? "lock" : "hash"} size={15} style={{ opacity: 0.55 }} />
            {channel.name}
          </div>
          <div style={styles.meta}>
            <Icon name="users" size={13} />
            12
            <span style={{ color: "var(--border-strong)" }}>·</span>
            Suivi des écritures et rapprochements
          </div>
          <div style={{ flex: 1 }} />
          <Tooltip label="Rechercher dans le canal" side="bottom">
            <IconButton
              className="wc-ibtn--bare"
              icon="search"
              label="Rechercher dans le canal"
              aria-pressed={panel === "search"}
              onClick={() => togglePanel("search")}
            />
          </Tooltip>
          <Tooltip label="Messages épinglés" side="bottom">
            <IconButton
              className="wc-ibtn--bare"
              icon="pin"
              label="Messages épinglés"
              aria-pressed={panel === "pinned"}
              onClick={() => togglePanel("pinned")}
            />
          </Tooltip>
          <Tooltip label="Fichiers du canal" side="bottom">
            <IconButton
              className="wc-ibtn--bare"
              icon="folder"
              label="Fichiers du canal"
              aria-pressed={panel === "files"}
              onClick={() => togglePanel("files")}
            />
          </Tooltip>
          <Tooltip label="Membres" side="bottom">
            <IconButton
              className="wc-ibtn--bare"
              icon="users"
              label="Membres"
              aria-pressed={panel === "members"}
              onClick={() => togglePanel("members")}
            />
          </Tooltip>
          <ChannelMenu
            onSettings={() => onNotify({ tone: "info", title: "Paramètres du canal", description: "À venir dans un prochain lot." })}
            onNotifications={() => onNotify({ tone: "info", title: "Notifications du canal", description: "À venir dans un prochain lot." })}
            onAddPeople={() => onNotify({ tone: "info", title: "Ajouter des personnes", description: "À venir dans un prochain lot." })}
            onLeave={() => onNotify({ tone: "warning", title: `Quitter #${channel.name}`, description: "À venir dans un prochain lot." })}
          />
        </div>
        <div style={styles.feed} ref={feedRef}>
          <div style={styles.inner}>
            <div style={{ padding: "4px 0 14px" }}>
              <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "var(--tracking-tight)", color: "var(--text-strong)" }}>
                #{channel.name}
              </div>
              <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 6, maxWidth: 560 }}>
                Canal privé créé le 14 janvier 2026 par Camille Roussel. L'historique a été repris
                depuis Slack jusqu'au 12 janvier.
              </p>
            </div>
            <div style={styles.day}>
              <span style={styles.dayLine} />
              <span style={styles.dayLbl}>Aujourd'hui</span>
              <span style={styles.dayLine} />
            </div>
            {messages.map((m) => (
              <Fragment key={m.id}>
                {m.id === unreadMarker ? (
                  <div style={styles.unread}>
                    <span style={styles.unreadLine} />
                    <span style={styles.unreadLabel}>Non lus</span>
                  </div>
                ) : null}
                {m.kind === "system" ? (
                  <SystemMessage m={m} />
                ) : (
                  <MessageRow
                    m={m}
                    actions={{
                      onReact: (emoji) => actions.react(m.id, emoji),
                      onOpenThread: () => actions.openThread(m.id),
                      onToggleSave: () => actions.toggleSave(m.id),
                      onEdit: () => actions.edit(m.id),
                      onTogglePin: () => actions.togglePin(m.id),
                      onCopyLink: () => actions.copyLink(m.id),
                      onCopyMessage: () => actions.copyMessage(m.id),
                      onMarkUnread: () => actions.markUnread(m.id),
                      onDelete: () => actions.remove(m.id),
                      onOpenProfile: () => actions.openProfile(m.author),
                      onEditProfile: () => actions.editProfile(m.author),
                      onMessage: () => actions.message(m.author),
                    }}
                  />
                )}
              </Fragment>
            ))}
          </div>
        </div>
        <TypingIndicator names={getTypingUsers(channel.id)} />
        <Composer channelName={channel.name} onSend={onSend} onNotify={onNotify} />
      </div>
      <RightDock open={rightNode != null} contentKey={contentKey}>
        {rightNode}
      </RightDock>
    </div>
  );
}
