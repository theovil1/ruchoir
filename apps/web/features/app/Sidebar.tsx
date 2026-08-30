"use client";

import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { Avatar, Badge, Icon, IconButton, Input, Popover, Tag } from "@/components/ds";
import type { Channel, DirectMessage, Workspace } from "@/lib/data";
import { MenuPopover } from "./MenuPopover";
import type { AppView, Toast } from "./types";
import { Wordmark } from "./Wordmark";

const styles: Record<string, CSSProperties> = {
  side: {
    width: "var(--sidebar-width)",
    flex: "none",
    background: "var(--surface-chrome)",
    borderRight: "1px solid var(--border-subtle)",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  head: {
    height: "var(--topbar-height)",
    flex: "none",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 8px 0 12px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  wsName: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    border: 0,
    background: "none",
    padding: "4px 6px",
    marginLeft: -6,
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: "var(--tracking-tight)",
    color: "var(--text-strong)",
  },
  scroll: { flex: 1, overflow: "auto", padding: "8px 8px 16px" },
  sect: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 6px 4px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "var(--tracking-caps)",
    textTransform: "uppercase",
    color: "var(--text-subtle)",
  },
  name: {
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
};

function item(on: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    height: 32,
    padding: "0 8px",
    border: 0,
    borderRadius: "var(--radius-sm)",
    background: on ? "var(--surface-selected)" : "transparent",
    color: on ? "var(--terracotta-800)" : "var(--text-body)",
    cursor: "pointer",
    fontFamily: "var(--font-sans)",
    fontSize: 14,
    fontWeight: on ? 500 : 400,
    textAlign: "left",
  };
}

export type SideMenuItem = { icon: string; label: string; onClick: () => void; danger?: boolean };

const menuStyle: CSSProperties = {
  minWidth: 200,
  padding: 4,
  background: "var(--surface-canvas)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-md)",
  boxShadow: "var(--shadow-popover)",
};

const menuItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  width: "100%",
  padding: "6px 8px",
  border: 0,
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  color: "var(--text-body)",
  fontFamily: "var(--font-sans)",
  fontSize: 13,
  textAlign: "left",
  cursor: "pointer",
};

type SideItemProps = {
  icon?: string;
  label: string;
  active?: boolean;
  unread?: number;
  muted?: boolean;
  tag?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
  menuItems?: SideMenuItem[];
};

function SideItem({ icon, label, active, unread, muted, tag, onClick, children, menuItems }: SideItemProps) {
  const [hover, setHover] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);
  const bg = active ? "var(--surface-selected)" : hover || menuOpen ? "var(--surface-hover)" : "transparent";
  const showMore = !!menuItems && menuItems.length > 0 && (hover || menuOpen);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...item(!!active), background: bg }}
    >
      {children ?? <Icon name={icon ?? "hash"} size={14} style={{ opacity: muted ? 0.5 : 0.75 }} />}
      <span
        style={{
          ...styles.name,
          opacity: muted ? 0.6 : 1,
          fontWeight: unread ? 500 : undefined,
          color: unread ? "var(--text-strong)" : undefined,
        }}
      >
        {label}
      </span>
      {tag}
      {menuItems && menuItems.length > 0 ? (
        // Fixed-width slot: the more-button is always mounted (opacity toggled) so the popover anchor
        // never moves as hover changes, and the unread badge shows underneath when it is hidden.
        <span style={{ position: "relative", flex: "none", width: 24, height: 20, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
          {!showMore && unread ? <Badge count={unread} /> : null}
          <IconButton
            ref={moreRef}
            icon="more-horizontal"
            label={`Actions pour ${label}`}
            size="sm"
            tabIndex={showMore ? 0 : -1}
            aria-hidden={!showMore}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((o) => !o);
            }}
            style={{
              position: "absolute",
              right: 0,
              opacity: showMore ? 1 : 0,
              pointerEvents: showMore ? "auto" : "none",
              transition: "opacity var(--duration-fast) var(--ease-out)",
            }}
          />
          <Popover anchorRef={moreRef} open={menuOpen} onClose={() => setMenuOpen(false)} placement="bottom" align="end">
            <div style={menuStyle} role="menu" onClick={(e) => e.stopPropagation()}>
              {menuItems.map((mi) => (
                <button
                  key={mi.label}
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    mi.onClick();
                    setMenuOpen(false);
                  }}
                  style={{ ...menuItemStyle, color: mi.danger ? "var(--status-danger-fg)" : "var(--text-body)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <Icon name={mi.icon} size={14} />
                  {mi.label}
                </button>
              ))}
            </div>
          </Popover>
        </span>
      ) : unread ? (
        <Badge count={unread} />
      ) : null}
    </div>
  );
}

export type SidebarProps = {
  workspace: Workspace | undefined;
  channels: Channel[];
  directMessages: DirectMessage[];
  view: AppView;
  channel: string;
  mentionCount: number;
  onView: (view: AppView) => void;
  onChannel: (id: string) => void;
  onNotify: (toast: Toast) => void;
  onImport: () => void;
  onInvite: () => void;
  onNewChannel: () => void;
  onNewMessage: () => void;
  onGlobalSearch: () => void;
  onLeaveChannel: (id: string) => void;
  onChannelSettings: (id: string) => void;
  onLogout: () => void;
  /** Compact (mobile) mode: full width, no wordmark/header/search (the mobile top bar owns those). */
  compact?: boolean;
  /** Render only one section, for the compact bottom-tab panels. Omit for the full desktop column. */
  only?: "channels" | "messages" | "activity";
};

/** Channel/DM navigation column for the active workspace. */
export function Sidebar({
  workspace,
  channels,
  directMessages,
  view,
  channel,
  mentionCount,
  onView,
  onChannel,
  onNotify,
  onImport,
  onInvite,
  onNewChannel,
  onNewMessage,
  onGlobalSearch,
  onLeaveChannel,
  onChannelSettings,
  onLogout,
  compact = false,
  only,
}: SidebarProps) {
  const showActivity = !only || only === "activity";
  const showChannels = !only || only === "channels";
  const showMessages = !only || only === "messages";
  const showFooter = !only || only === "channels";
  const channelMenu = (id: string, name: string): SideMenuItem[] => [
    { icon: "check-check", label: "Marquer comme lu", onClick: () => onNotify({ tone: "info", title: "Marqué comme lu", description: `#${name}` }) },
    { icon: "bell", label: "Notifications", onClick: () => onNotify({ tone: "info", title: "Notifications", description: `#${name}` }) },
    { icon: "settings", label: "Paramètres du canal", onClick: () => onChannelSettings(id) },
    { icon: "log-out", label: "Quitter le canal", danger: true, onClick: () => onLeaveChannel(id) },
  ];
  const dmMenu = (name: string): SideMenuItem[] => [
    { icon: "check-check", label: "Marquer comme lu", onClick: () => onNotify({ tone: "info", title: "Marqué comme lu", description: name }) },
    { icon: "bell", label: "Notifications", onClick: () => onNotify({ tone: "info", title: "Notifications", description: name }) },
    { icon: "x", label: "Masquer la conversation", onClick: () => onNotify({ tone: "info", title: "Conversation masquée", description: name }) },
  ];
  const [wsMenu, setWsMenu] = useState(false);
  const wsRef = useRef<HTMLButtonElement>(null);

  return (
    <div style={{ ...styles.side, width: compact ? "100%" : styles.side.width, flex: compact ? 1 : styles.side.flex }}>
      {!compact ? (
        <>
          <Wordmark />
          <div style={styles.head}>
            <button ref={wsRef} style={styles.wsName} onClick={() => setWsMenu((o) => !o)} aria-expanded={wsMenu}>
              {workspace?.name}
              <Icon name="chevron-down" size={14} />
            </button>
            <MenuPopover
              anchorRef={wsRef}
              open={wsMenu}
              onClose={() => setWsMenu(false)}
              items={[
                { type: "label", label: workspace?.name ?? "Espace" },
                { icon: "user-plus", label: "Inviter des personnes", onClick: onInvite },
                { icon: "settings", label: "Réglages de l'espace", onClick: () => onView("settings") },
                { icon: "hard-drive", label: "Fichiers de l'espace", onClick: () => onView("files") },
                { type: "separator" },
                { icon: "log-out", label: "Se déconnecter", danger: true, onClick: onLogout },
              ]}
            />
            <IconButton icon="square-pen" label="Nouveau message" size="sm" onClick={onNewMessage} />
          </div>
          <div style={{ padding: "8px 8px 0" }}>
            <Input
              size="sm"
              icon="search"
              placeholder="Rechercher un canal, une personne…"
              readOnly
              onClick={onGlobalSearch}
            />
          </div>
        </>
      ) : null}
      <div style={styles.scroll}>
        {showActivity ? (
          <>
            <SideItem icon="inbox" label="Fils de discussion" active={view === "threads"} onClick={() => onView("threads")} />
            <SideItem icon="at-sign" label="Mentions" active={view === "mentions"} unread={mentionCount} onClick={() => onView("mentions")} />
            <SideItem icon="hard-drive" label="Fichiers de l'espace" active={view === "files"} onClick={() => onView("files")} />
            <SideItem icon="bookmark" label="Enregistrés" active={view === "saved"} onClick={() => onView("saved")} />
          </>
        ) : null}

        {showChannels ? (
          <>
            <div style={styles.sect}>Canaux favoris</div>
            {channels
              .filter((c) => c.fav)
              .map((c) => (
                <SideItem
                  key={c.id}
                  label={c.name}
                  unread={c.unread}
                  active={view === "channel" && channel === c.id}
                  onClick={() => onChannel(c.id)}
                  menuItems={channelMenu(c.id, c.name)}
                >
                  <Icon name={c.type === "private" ? "lock" : "hash"} size={13} style={{ opacity: 0.6 }} />
                </SideItem>
              ))}

            <div style={styles.sect}>
              Canaux
              <button
                onClick={onNewChannel}
                aria-label="Nouveau canal"
                style={{ border: 0, background: "none", padding: 0, cursor: "pointer", color: "var(--text-subtle)", display: "flex" }}
              >
                <Icon name="plus" size={13} />
              </button>
            </div>
            {channels
              .filter((c) => !c.fav)
              .map((c) => (
                <SideItem
                  key={c.id}
                  label={c.name}
                  unread={c.unread}
                  muted={c.type === "archived"}
                  active={view === "channel" && channel === c.id}
                  onClick={() => onChannel(c.id)}
                  menuItems={channelMenu(c.id, c.name)}
                >
                  <Icon
                    name={c.type === "archived" ? "archive" : c.type === "private" ? "lock" : "hash"}
                    size={13}
                    style={{ opacity: 0.6 }}
                  />
                </SideItem>
              ))}
          </>
        ) : null}

        {showMessages ? (
          <>
            <div style={styles.sect}>Messages directs</div>
            {directMessages.map((d) => (
              <SideItem
                key={d.id}
                label={d.name}
                unread={d.unread}
                active={view === "channel" && channel === d.id}
                tag={d.bot ? <Tag>Bot</Tag> : undefined}
                onClick={() => onChannel(d.id)}
                menuItems={dmMenu(d.name)}
              >
                <Avatar name={d.name} size={20} presence={d.presence} kind={d.bot ? "bot" : "person"} shape={d.bot ? "round" : "square"} />
              </SideItem>
            ))}
          </>
        ) : null}

        {showFooter ? (
          <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
            <SideItem icon="import" label="Importer une conversation…" onClick={onImport} />
            <SideItem icon="settings" label="Réglages de l'espace" active={view === "settings"} onClick={() => onView("settings")} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
