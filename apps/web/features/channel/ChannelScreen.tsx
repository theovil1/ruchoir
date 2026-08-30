"use client";

import { type CSSProperties, Fragment, type ReactNode, useEffect, useRef, useState } from "react";
import { Avatar, Icon, IconButton, Tooltip } from "@/components/ds";
import { getChannelMembers, getDirectMessages, getPresence, getProfile, getSpaceFiles, getTypingUsers } from "@/lib/data";
import type { Channel, DirectMessage, Message, MessageAttachment } from "@/lib/data";
import { useMountAnimation } from "../app/useMountAnimation";
import { ProfilePanel } from "./ProfilePanel";
import type { ChannelPanel, Toast } from "../app/types";
import { ChannelMenu } from "./ChannelMenu";
import {
  AddPeopleDialog,
  ChannelNotificationsDialog,
  ChannelSettingsDialog,
  LeaveChannelDialog,
} from "./ChannelDialogs";
import { SearchPanel } from "./SearchPanel";
import { type ChannelMember, SidePanel } from "./SidePanel";
import { Composer } from "./Composer";
import { MessageRow } from "./MessageRow";
import { SystemMessage } from "./SystemMessage";
import { ThreadPanel } from "./ThreadPanel";
import { TypingIndicator } from "./TypingIndicator";

/** Right-hand dock: animates in/out, stays mounted during exit, and cross-fades on content switch. */
function RightDock({
  open,
  contentKey,
  compact = false,
  children,
}: {
  open: boolean;
  contentKey: string;
  compact?: boolean;
  children: ReactNode;
}) {
  const { mounted, closing } = useMountAnimation(open, 200);
  const last = useRef<ReactNode>(null);
  const lastKey = useRef("");
  if (open) {
    last.current = children;
    lastKey.current = contentKey;
  }
  if (!mounted) return null;
  // Compact: the panel (members, files, thread, profile) can no longer be a fixed column beside the
  // feed, so it covers the whole view as a full-screen sheet. Setting `--panel-width: 100%` makes the
  // panels (which size themselves from that variable) fill the width instead of staying at 340px.
  // Its own header close button dismisses it.
  const container: CSSProperties = compact
    ? {
        position: "absolute",
        inset: 0,
        zIndex: 40,
        width: "100%",
        display: "flex",
        background: "var(--surface-canvas)",
        ["--panel-width" as string]: "100%",
      }
    : { display: "flex", flex: "none" };
  return (
    <div style={container} className={closing ? "wc-dock--out" : "wc-dock--in"}>
      <div
        key={open ? contentKey : lastKey.current}
        className="wc-dock-content"
        style={{ display: "flex", flex: compact ? 1 : undefined, minWidth: 0, background: compact ? "var(--surface-canvas)" : undefined }}
      >
        {open ? children : last.current}
      </div>
    </div>
  );
}

const PRESENCE_LABEL: Record<string, string> = {
  online: "En ligne",
  away: "Absent",
  busy: "Occupé",
  offline: "Hors ligne",
};

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
    minWidth: 0,
    flexShrink: 0,
    fontSize: 17,
    fontWeight: 600,
    letterSpacing: "var(--tracking-tight)",
    color: "var(--text-strong)",
    whiteSpace: "nowrap",
  },
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    minWidth: 0,
    overflow: "hidden",
    whiteSpace: "nowrap",
    textOverflow: "ellipsis",
    fontSize: 13,
    color: "var(--text-muted)",
  },
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

type MenuDialog = "settings" | "notifications" | "addpeople" | "leave" | null;

export type ChannelScreenProps = {
  channel: Channel;
  /** Set when the open conversation is a direct message rather than a channel. */
  dm?: DirectMessage | null;
  messages: Message[];
  panel: ChannelPanel;
  threadId: number | null;
  profileName: string | null;
  profileEditing: boolean;
  unreadMarker: number | null;
  onSend: (text: string, attachment?: MessageAttachment) => void;
  onPanel: (panel: ChannelPanel) => void;
  onCloseThread: () => void;
  onCloseProfile: () => void;
  onNotify: (toast: Toast) => void;
  onUpdateChannel: (patch: Partial<Channel>) => void;
  onLeaveChannel: () => void;
  /** When set, the feed scrolls to and flashes this message after it renders. */
  focusMessageId?: number | null;
  /** Compact (mobile) mode: the right panel becomes a full-width overlay instead of a column. */
  compact?: boolean;
  actions: MessageActionHandlers;
};

/** The channel (or direct message) view: header, message feed, composer, and optional right panel. */
export function ChannelScreen({
  channel,
  dm,
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
  onUpdateChannel,
  onLeaveChannel,
  focusMessageId,
  compact = false,
  actions,
}: ChannelScreenProps) {
  const isDm = !!dm;
  const members: ChannelMember[] = [...getDirectMessages(), ...EXTRA_MEMBERS];
  const threadParent = threadId != null ? messages.find((m) => m.id === threadId) : undefined;
  const pinned = messages.filter((m) => m.pinned && !m.deleted);
  const togglePanel = (p: Exclude<ChannelPanel, null>) => onPanel(panel === p ? null : p);
  const [menuDialog, setMenuDialog] = useState<MenuDialog>(null);

  const feedRef = useRef<HTMLDivElement>(null);
  const msgCount = messages.length;
  // Land at the latest message when entering a conversation, and follow new messages.
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

  // Jump to a message requested from global search or an activity view, once it has rendered.
  useEffect(() => {
    if (!focusMessageId) return;
    const raf = requestAnimationFrame(() => jumpToMessage(focusMessageId));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMessageId, channel.id]);

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

  const dmProfile = isDm ? getProfile(dm.name) : null;
  const typing = getTypingUsers(channel.id);

  return (
    <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, position: "relative" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
        <div style={styles.top}>
          {isDm ? (
            <>
              <div style={styles.title}>
                <Avatar name={dm.name} size={22} presence={getPresence(dm.name)} kind={dm.bot ? "bot" : "person"} />
                {dm.name}
              </div>
              <div style={styles.meta}>{dmProfile?.role ?? PRESENCE_LABEL[getPresence(dm.name)]}</div>
            </>
          ) : (
            <>
              <div style={styles.title}>
                <Icon name={channel.type === "private" ? "lock" : "hash"} size={15} style={{ opacity: 0.55 }} />
                {channel.name}
              </div>
              <div style={styles.meta}>
                <Icon name="users" size={13} />
                {members.length}
                {channel.topic ? (
                  <>
                    <span style={{ color: "var(--border-strong)" }}>·</span>
                    {channel.topic}
                  </>
                ) : null}
              </div>
            </>
          )}
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", alignItems: "center", minWidth: 0, overflowX: "auto", flexShrink: 1, scrollbarWidth: "none" }}>
          <Tooltip label="Rechercher dans la conversation" side="bottom">
            <IconButton
              className="wc-ibtn--bare"
              icon="search"
              label="Rechercher dans la conversation"
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
          <Tooltip label="Fichiers" side="bottom">
            <IconButton
              className="wc-ibtn--bare"
              icon="folder"
              label="Fichiers"
              aria-pressed={panel === "files"}
              onClick={() => togglePanel("files")}
            />
          </Tooltip>
          {!isDm ? (
            <Tooltip label="Membres" side="bottom">
              <IconButton
                className="wc-ibtn--bare"
                icon="users"
                label="Membres"
                aria-pressed={panel === "members"}
                onClick={() => togglePanel("members")}
              />
            </Tooltip>
          ) : null}
          {!isDm ? (
            <ChannelMenu
              onSettings={() => setMenuDialog("settings")}
              onNotifications={() => setMenuDialog("notifications")}
              onAddPeople={() => setMenuDialog("addpeople")}
              onLeave={() => setMenuDialog("leave")}
            />
          ) : null}
          </div>
        </div>
        <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ ...styles.feed, paddingBottom: typing.length > 0 ? 60 : 8 }} ref={feedRef}>
          <div style={styles.inner}>
            <div style={{ padding: "4px 0 14px" }}>
              {isDm ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Avatar name={dm.name} size={44} presence={getPresence(dm.name)} kind={dm.bot ? "bot" : "person"} />
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "var(--tracking-tight)", color: "var(--text-strong)" }}>
                        {dm.name}
                      </div>
                      {dmProfile?.role ? <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{dmProfile.role}</div> : null}
                    </div>
                  </div>
                  <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 10, maxWidth: 560 }}>
                    Ceci est le début de votre conversation privée avec {dm.name.split(" ")[0]}. Les messages ne sont visibles que
                    par vous deux.
                  </p>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "var(--tracking-tight)", color: "var(--text-strong)" }}>
                    #{channel.name}
                  </div>
                  <p style={{ fontSize: 14, color: "var(--text-muted)", marginTop: 6, maxWidth: 560 }}>
                    {channel.type === "private" ? "Canal privé." : "Canal public."} {channel.topic ? `${channel.topic}. ` : ""}
                    {channel.imported ? `L'historique a été repris depuis ${channel.imported}.` : "Début du canal."}
                  </p>
                </>
              )}
            </div>
            {msgCount > 0 ? (
              <div style={styles.day}>
                <span style={styles.dayLine} />
                <span style={styles.dayLbl}>Aujourd'hui</span>
                <span style={styles.dayLine} />
              </div>
            ) : null}
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
          {typing.length > 0 ? (
            <>
              <div
                aria-hidden
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  height: 56,
                  background: "linear-gradient(0deg, var(--surface-canvas) 55%, transparent 100%)",
                  pointerEvents: "none",
                }}
              />
              <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
                <TypingIndicator names={typing} />
              </div>
            </>
          ) : null}
        </div>
        <Composer channelName={isDm ? dm.name : channel.name} onSend={onSend} onNotify={onNotify} />
      </div>
      <RightDock open={rightNode != null} contentKey={contentKey} compact={compact}>
        {rightNode}
      </RightDock>

      {menuDialog === "settings" ? (
        <ChannelSettingsDialog channel={channel} onClose={() => setMenuDialog(null)} onUpdate={onUpdateChannel} onNotify={onNotify} />
      ) : null}
      {menuDialog === "notifications" ? (
        <ChannelNotificationsDialog channelName={channel.name} onClose={() => setMenuDialog(null)} onNotify={onNotify} />
      ) : null}
      {menuDialog === "addpeople" ? (
        <AddPeopleDialog channelName={channel.name} people={getChannelMembers()} onClose={() => setMenuDialog(null)} onNotify={onNotify} />
      ) : null}
      {menuDialog === "leave" ? (
        <LeaveChannelDialog
          channelName={channel.name}
          onClose={() => setMenuDialog(null)}
          onConfirm={() => {
            setMenuDialog(null);
            onLeaveChannel();
          }}
        />
      ) : null}
    </div>
  );
}
