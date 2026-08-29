"use client";

import { type CSSProperties, useMemo, useRef, useState } from "react";
import {
  getChannel,
  getChannelMessages,
  getChannels,
  getCurrentUser,
  getDirectMessages,
  getWorkspace,
  getWorkspaces,
  setUserPresence,
} from "@/lib/data";
import type { Channel, Message } from "@/lib/data";
import type { Presence } from "@/components/ds";
import { ChannelScreen } from "@/features/channel/ChannelScreen";
import { EmptyView } from "./EmptyView";
import { SettingsDialog } from "./SettingsDialog";
import { SettingsProvider } from "./settings";
import { Sidebar } from "./Sidebar";
import type { AppView, ChannelPanel, Toast } from "./types";
import { WorkspaceRail } from "./WorkspaceRail";

/** Wraps the app in the settings provider (emoji rendering, etc.). */
export function AppRoot() {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  );
}

const toastStyle: Record<string, CSSProperties> = {
  wrap: { position: "fixed", right: 20, bottom: 20, zIndex: 60 },
  card: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 240,
    maxWidth: 360,
    padding: "10px 14px",
    borderRadius: "var(--radius-md)",
    background: "var(--surface-inverse)",
    color: "var(--text-inverse)",
    boxShadow: "var(--shadow-dialog)",
  },
  title: { fontSize: 13, fontWeight: 600 },
  desc: { fontSize: 12, color: "var(--grey-300)" },
};

/** Resolve a channel-shaped object for a channel id or a direct message id. */
function resolveChannel(id: string): Channel {
  const channel = getChannel(id);
  if (channel) return channel;
  const dm = getDirectMessages().find((d) => d.id === id);
  return { id, name: dm?.name ?? "général", fav: false, unread: 0, type: "public" };
}

/**
 * Client root of the app shell. Holds the simulated navigation and message state for the
 * L5a exploration. No network, no persistence: reloading resets everything. All domain
 * data is read through the data seam (@/lib/data), never from fixtures directly.
 */
function AppShell() {
  const workspaces = useMemo(() => getWorkspaces(), []);
  const channels = useMemo(() => getChannels(), []);
  const directMessages = useMemo(() => getDirectMessages(), []);
  const currentUser = getCurrentUser().name;

  const [ws, setWs] = useState("atelier");
  const [view, setView] = useState<AppView>("channel");
  const [channelId, setChannelId] = useState("compta");
  const [panel, setPanel] = useState<ChannelPanel>("files");
  const [thread, setThread] = useState<number | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [profileEdit, setProfileEdit] = useState(false);
  const [unreadMarker, setUnreadMarker] = useState<number | null>(null);
  const [myPresence, setMyPresence] = useState<Presence>("online");
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Record<string, Message[]>>({
    compta: getChannelMessages("compta"),
  });
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const chan = resolveChannel(channelId);
  const feed = messages[channelId] ?? getChannelMessages(channelId);

  const showToast = (t: Toast) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  const openChannel = (id: string) => {
    setView("channel");
    setChannelId(id);
    setThread(null);
    setProfile(null);
    setProfileEdit(false);
    setUnreadMarker(null);
  };

  /** Switch the right panel, closing the thread and profile views so it is visible. */
  const openPanel = (next: ChannelPanel) => {
    setPanel(next);
    setThread(null);
    setProfile(null);
  };

  const updateMessage = (messageId: number, updater: (m: Message) => Message) => {
    setMessages((prev) => {
      const list = prev[channelId] ?? getChannelMessages(channelId);
      return { ...prev, [channelId]: list.map((m) => (m.id === messageId ? updater(m) : m)) };
    });
  };

  const messageActions = {
    react: (messageId: number, emoji: string) =>
      updateMessage(messageId, (m) => {
        const reactions = m.reactions ? m.reactions.map((r) => ({ ...r })) : [];
        const idx = reactions.findIndex((r) => r.emoji === emoji);
        if (idx === -1) {
          reactions.push({ emoji, count: 1, mine: true });
        } else if (reactions[idx].mine) {
          const count = reactions[idx].count - 1;
          if (count <= 0) reactions.splice(idx, 1);
          else reactions[idx] = { ...reactions[idx], count, mine: false };
        } else {
          reactions[idx] = { ...reactions[idx], count: reactions[idx].count + 1, mine: true };
        }
        return { ...m, reactions };
      }),
    openThread: (messageId: number) => {
      setThread(messageId);
      setProfile(null);
    },
    openProfile: (name: string) => {
      setProfile(name);
      setProfileEdit(false);
      setThread(null);
    },
    editProfile: (name: string) => {
      setProfile(name);
      setProfileEdit(true);
      setThread(null);
    },
    message: (name: string) =>
      showToast({ tone: "info", title: `Message à ${name}`, description: "Messagerie directe à venir dans un prochain lot." }),
    toggleSave: (messageId: number) => {
      const nowSaved = !(feed.find((x) => x.id === messageId)?.saved ?? false);
      updateMessage(messageId, (m) => ({ ...m, saved: nowSaved }));
      showToast({
        tone: nowSaved ? "success" : "info",
        title: nowSaved ? "Message enregistré" : "Retiré des enregistrés",
      });
    },
    edit: () => showToast({ tone: "info", title: "Modification", description: "Édition à venir dans un prochain lot." }),
    togglePin: (messageId: number) => {
      const nowPinned = !(feed.find((x) => x.id === messageId)?.pinned ?? false);
      updateMessage(messageId, (m) => ({ ...m, pinned: nowPinned }));
      showToast({ tone: "info", title: nowPinned ? "Message épinglé" : "Message désépinglé" });
    },
    copyLink: () => showToast({ tone: "success", title: "Lien copié" }),
    copyMessage: (messageId: number) => {
      const target = feed.find((x) => x.id === messageId);
      navigator.clipboard?.writeText(target?.body ?? "");
      showToast({ tone: "success", title: "Message copié" });
    },
    markUnread: (messageId: number) => {
      setUnreadMarker(messageId);
      showToast({ tone: "info", title: "Marqué comme non lu" });
    },
    remove: (messageId: number) => {
      updateMessage(messageId, (m) => ({ ...m, deleted: true }));
      showToast({ tone: "info", title: "Message supprimé" });
    },
  };

  const send = (text: string) => {
    const message: Message = {
      id: Date.now(),
      author: currentUser,
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      body: text,
    };
    setMessages((prev) => ({
      ...prev,
      [channelId]: [...(prev[channelId] ?? getChannelMessages(channelId)), message],
    }));
    showToast({ tone: "info", title: "Message envoyé", description: `#${chan.name}` });
  };

  return (
    <div style={{ height: "100vh", display: "flex", overflow: "hidden", background: "var(--surface-canvas)" }}>
      <WorkspaceRail
        workspaces={workspaces}
        active={ws}
        currentUser={currentUser}
        onSelect={setWs}
        onNew={() =>
          showToast({ tone: "info", title: "Création d'espace", description: "À venir dans un prochain lot." })
        }
        onNotify={showToast}
        presence={myPresence}
        onSetPresence={(p) => {
          setUserPresence(currentUser, p);
          setMyPresence(p);
        }}
        onOpenSettings={() => setShowSettings(true)}
        onOpenOwnProfile={() => {
          setView("channel");
          setThread(null);
          setProfileEdit(false);
          setProfile(currentUser);
        }}
        onEditOwnProfile={() => {
          setView("channel");
          setThread(null);
          setProfileEdit(true);
          setProfile(currentUser);
        }}
      />
      <Sidebar
        workspace={getWorkspace(ws)}
        channels={channels}
        directMessages={directMessages}
        view={view}
        channel={channelId}
        onView={setView}
        onChannel={openChannel}
        onNotify={showToast}
        onImport={() =>
          showToast({ tone: "info", title: "Import", description: "Écran d'import à venir dans un prochain lot." })
        }
      />

      {view === "channel" ? (
        <ChannelScreen
          channel={chan}
          messages={feed}
          panel={panel}
          threadId={thread}
          profileName={profile}
          profileEditing={profileEdit}
          unreadMarker={unreadMarker}
          onSend={send}
          onPanel={openPanel}
          onCloseThread={() => setThread(null)}
          onCloseProfile={() => setProfile(null)}
          onNotify={showToast}
          actions={messageActions}
        />
      ) : null}
      {view === "files" ? (
        <EmptyView icon="hard-drive" title="Fichiers de l'espace" text="Écran des fichiers à venir dans un prochain lot de cette exploration." />
      ) : null}
      {view === "settings" ? (
        <EmptyView icon="settings" title="Réglages de l'espace" text="Écran des réglages à venir dans un prochain lot de cette exploration." />
      ) : null}
      {view === "threads" ? (
        <EmptyView icon="inbox" title="Aucun fil en attente" text="Les fils auxquels vous participez apparaissent ici, les plus récents d'abord." />
      ) : null}
      {view === "mentions" ? (
        <EmptyView icon="at-sign" title="4 mentions" text="Vue non détaillée dans cette exploration : elle reprend la mise en page du canal, filtrée sur vos mentions." />
      ) : null}
      {view === "saved" ? (
        <EmptyView icon="bookmark" title="Rien d'enregistré" text="Enregistrez un message depuis les actions au survol pour le retrouver ici." />
      ) : null}

      {toast ? (
        <div style={toastStyle.wrap} role="status" aria-live="polite">
          <div style={toastStyle.card}>
            <span style={toastStyle.title}>{toast.title}</span>
            {toast.description ? <span style={toastStyle.desc}>{toast.description}</span> : null}
          </div>
        </div>
      ) : null}

      {showSettings ? <SettingsDialog onClose={() => setShowSettings(false)} /> : null}
    </div>
  );
}
