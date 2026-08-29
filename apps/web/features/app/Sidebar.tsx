"use client";

import { type CSSProperties, type ReactNode, useRef, useState } from "react";
import { Avatar, Badge, Icon, IconButton, Input, Tag } from "@/components/ds";
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

type SideItemProps = {
  icon?: string;
  label: string;
  active?: boolean;
  unread?: number;
  muted?: boolean;
  tag?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
};

function SideItem({ icon, label, active, unread, muted, tag, onClick, children }: SideItemProps) {
  const [hover, setHover] = useState(false);
  const bg = active
    ? "var(--surface-selected)"
    : hover
      ? "var(--surface-hover)"
      : "transparent";
  return (
    <button
      style={{ ...item(!!active), background: bg }}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
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
      {unread ? <Badge count={unread} /> : null}
    </button>
  );
}

export type SidebarProps = {
  workspace: Workspace | undefined;
  channels: Channel[];
  directMessages: DirectMessage[];
  view: AppView;
  channel: string;
  onView: (view: AppView) => void;
  onChannel: (id: string) => void;
  onNotify: (toast: Toast) => void;
  onImport: () => void;
};

/** Channel/DM navigation column for the active workspace. */
export function Sidebar({
  workspace,
  channels,
  directMessages,
  view,
  channel,
  onView,
  onChannel,
  onNotify,
  onImport,
}: SidebarProps) {
  const [wsMenu, setWsMenu] = useState(false);
  const wsRef = useRef<HTMLButtonElement>(null);
  const soon = (title: string) => onNotify({ tone: "info", title, description: "À venir dans un prochain lot." });

  return (
    <div style={styles.side}>
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
            { icon: "user-plus", label: "Inviter des personnes", onClick: () => soon("Inviter des personnes") },
            { icon: "settings", label: "Préférences de l'espace", onClick: () => soon("Préférences de l'espace") },
            { icon: "hard-drive", label: "Fichiers de l'espace", onClick: () => onView("files") },
            { type: "separator" },
            { icon: "arrow-left", label: "Se déconnecter", danger: true, onClick: () => soon("Déconnexion") },
          ]}
        />
        <IconButton icon="square-pen" label="Nouveau message" size="sm" onClick={() => soon("Nouveau message")} />
      </div>
      <div style={{ padding: "8px 8px 0" }}>
        <Input
          size="sm"
          icon="search"
          placeholder="Rechercher un canal, une personne…"
          readOnly
          onClick={() => soon("Recherche globale")}
        />
      </div>
      <div style={styles.scroll}>
        <SideItem icon="inbox" label="Fils de discussion" active={view === "threads"} onClick={() => onView("threads")} />
        <SideItem icon="at-sign" label="Mentions" active={view === "mentions"} unread={4} onClick={() => onView("mentions")} />
        <SideItem icon="hard-drive" label="Fichiers de l'espace" active={view === "files"} onClick={() => onView("files")} />
        <SideItem icon="bookmark" label="Enregistrés" active={view === "saved"} onClick={() => onView("saved")} />

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
            >
              <Icon name={c.type === "private" ? "lock" : "hash"} size={13} style={{ opacity: 0.6 }} />
            </SideItem>
          ))}

        <div style={styles.sect}>
          Canaux
          <button
            onClick={() => soon("Nouveau canal")}
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
            >
              <Icon
                name={c.type === "archived" ? "archive" : c.type === "private" ? "lock" : "hash"}
                size={13}
                style={{ opacity: 0.6 }}
              />
            </SideItem>
          ))}

        <div style={styles.sect}>Messages directs</div>
        {directMessages.map((d) => (
          <SideItem
            key={d.id}
            label={d.name}
            unread={d.unread}
            active={view === "channel" && channel === d.id}
            tag={d.bot ? <Tag>Bot</Tag> : undefined}
            onClick={() => onChannel(d.id)}
          >
            <Avatar name={d.name} size={20} presence={d.presence} kind={d.bot ? "bot" : "person"} shape={d.bot ? "round" : "square"} />
          </SideItem>
        ))}

        <div style={{ marginTop: 16, paddingTop: 12, borderTop: "1px solid var(--border-subtle)" }}>
          <SideItem icon="import" label="Importer une conversation…" onClick={onImport} />
          <SideItem icon="settings" label="Réglages de l'espace" active={view === "settings"} onClick={() => onView("settings")} />
        </div>
      </div>
    </div>
  );
}
