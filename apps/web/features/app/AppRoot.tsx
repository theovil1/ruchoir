"use client";

import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import {
  getChannelMembers,
  getChannelMessages,
  getChannels,
  getCurrentUser,
  getDirectMessages,
  getPresence,
  getSpaceFiles,
  getWorkspace,
  getWorkspaces,
  setUserPresence,
} from "@/lib/data";
import type { Channel, DirectMessage, Message, SpaceFile, Workspace } from "@/lib/data";
import { Button, Dialog, Drawer, Textarea } from "@/components/ds";
import type { Presence } from "@/components/ds";
import { ChannelScreen } from "@/features/channel/ChannelScreen";
import { ChannelNotificationsDialog, ChannelSettingsDialog } from "@/features/channel/ChannelDialogs";
import { LoginScreen } from "@/features/auth/LoginScreen";
import { SignupScreen } from "@/features/auth/SignupScreen";
import { OnboardingFlow } from "@/features/auth/OnboardingFlow";
import { FilesScreen } from "@/features/files/FilesScreen";
import { WorkspaceSettings } from "@/features/settings/WorkspaceSettings";
import { ImportDialog } from "@/features/import/ImportDialog";
import { ActivityView } from "./ActivityView";
import { collectMentions, collectSaved, collectThreads, flattenMessages, type MessageMap } from "./activity";
import { HelpDialog, InviteDialog, NewChannelDialog, NewMessageDialog, NewWorkspaceDialog } from "./dialogs";
import { GlobalSearchDialog } from "./GlobalSearchDialog";
import { QuickSwitcher } from "./QuickSwitcher";
import { useGlobalShortcuts } from "./useGlobalShortcuts";
import {
  buildNotifications,
  type ChannelNotifPref,
  DEFAULT_CHANNEL_PREF,
  passesPref,
} from "./notifications";
import { PreferencesScreen, type PrefTab } from "./PreferencesScreen";
import { SettingsProvider, useSettings } from "./settings";
import { Sidebar } from "./Sidebar";
import type { AppView, ChannelPanel, Toast } from "./types";
import { WorkspaceRail } from "./WorkspaceRail";
import { readDeepLink } from "@/lib/dev/deeplink";
import { useCompact } from "./useCompact";
import { MobileTopBar } from "./MobileTopBar";
import { BottomTabs } from "./BottomTabs";

/** Wraps the app in the settings provider (emoji rendering, etc.). */
export function AppRoot() {
  return (
    <SettingsProvider>
      <AppShell />
    </SettingsProvider>
  );
}

type Modal = "import" | "newChannel" | "newMessage" | "invite" | "newWorkspace" | "help" | "search" | "switcher" | null;

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

/** Turn a display name or channel name into a URL-safe id, unique against existing ids. */
function uniqueId(base: string, taken: string[]): string {
  const slug =
    base
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "canal";
  if (!taken.includes(slug)) return slug;
  let n = 2;
  while (taken.includes(`${slug}-${n}`)) n += 1;
  return `${slug}-${n}`;
}

/**
 * Client root of the app shell. Holds the simulated navigation and mutable domain state for the
 * L5a exploration. No network, no persistence: reloading resets everything. All seed data is read
 * through the data seam (@/lib/data), then lifted into state so the UI can mutate it.
 */
function AppShell() {
  const currentUser = getCurrentUser().name;
  const settings = useSettings();

  const [authStage, setAuthStage] = useState<"login" | "signup" | "onboarding" | "app">("app");
  const [signupFirst, setSignupFirst] = useState("");
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => getWorkspaces());
  const [channels, setChannels] = useState<Channel[]>(() => getChannels());
  const [dms, setDms] = useState<DirectMessage[]>(() => getDirectMessages());
  const [files, setFiles] = useState<SpaceFile[]>(() => getSpaceFiles());
  const [messages, setMessages] = useState<MessageMap>(() => {
    const map: MessageMap = {};
    for (const c of getChannels()) map[c.id] = getChannelMessages(c.id);
    for (const d of getDirectMessages()) map[d.id] = getChannelMessages(d.id);
    return map;
  });
  // Notification inbox, derived once from the seed and then mutated in place (read state).
  const [notifs, setNotifs] = useState(() => buildNotifications(messages, channels, dms, currentUser));
  // Per-conversation notification preferences, keyed by channel/DM id. Absent = defaults (all, unmuted).
  const [channelPrefs, setChannelPrefs] = useState<Record<string, ChannelNotifPref>>({});
  const [channelNotifId, setChannelNotifId] = useState<string | null>(null);

  const [ws, setWs] = useState("atelier");
  const [view, setView] = useState<AppView>("channel");
  // The view to restore when the full-screen preferences are closed (they are opened from menus, not the nav).
  const [prevView, setPrevView] = useState<AppView>("channel");
  // Which preferences section to land on when the full-screen preferences open.
  const [prefsTab, setPrefsTab] = useState<PrefTab>("appearance");
  // Dev/audit only: a click-only popover the deep-link asked to open on load (set post-mount, see below).
  const [deepLinkPop, setDeepLinkPop] = useState<string | undefined>(undefined);
  const [channelId, setChannelId] = useState("compta");
  // Desktop opens a conversation with its default panel: members for a channel, files for a DM (see
  // openChannel). The landing conversation is a channel, so it starts on members. `compact` is false on
  // the first render (SSR-safe, see useCompact), so this matches the server render; the compact shell
  // shows the list first and openChannel resets the panel per navigation anyway.
  const [panel, setPanel] = useState<ChannelPanel>(() =>
    channels.some((c) => c.id === channelId) ? "members" : "files",
  );
  // True once the user closes the right panel by hand, so opening another conversation stops
  // auto-opening its default panel. Reset when they open a panel again.
  const [panelDismissed, setPanelDismissed] = useState(false);
  const [thread, setThread] = useState<number | null>(null);
  const [profile, setProfile] = useState<string | null>(null);
  const [profileEdit, setProfileEdit] = useState(false);
  const [unreadMarker, setUnreadMarker] = useState<number | null>(null);
  const [focusMessageId, setFocusMessageId] = useState<number | null>(null);
  const [myPresence, setMyPresence] = useState<Presence>("online");
  const [modal, setModal] = useState<Modal>(null);
  const [channelSettingsId, setChannelSettingsId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: number; body: string } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Compact (mobile/narrow) shell state. `mobileTab` picks the bottom-tab list; `mobileContent`
  // is true when a conversation or view is pushed full-screen over that list; `railOpen` toggles
  // the workspace rail drawer.
  const compact = useCompact();
  const [mobileTab, setMobileTab] = useState<"channels" | "messages" | "activity">("channels");
  const [mobileContent, setMobileContent] = useState(false);
  const [railOpen, setRailOpen] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Dev-only: land directly on a UI state from query params (see lib/dev/deeplink.ts).
  // A no-op in the production static export; used by tools/responsive-audit to reach every screen.
  useEffect(() => {
    const link = readDeepLink();
    if (!link) return;
    // One-shot dev entry point: apply the URL deep-link to the app's state on mount. Reading it in the
    // state initializers instead would diverge from the server render (readDeepLink is client-only), so
    // the synchronous setStates here are intentional.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (link.stage) setAuthStage(link.stage);
    if (link.view) setView(link.view);
    if (link.prefsTab) setPrefsTab(link.prefsTab);
    if (link.channel) setChannelId(link.channel);
    if (link.panel) setPanel(link.panel);
    if (link.modal) setModal(link.modal);
    if (link.push) setMobileContent(true); // compact: land on the pushed content, not the list
    // Appearance is a persisted setting, not component state, so the audit forces it through the store.
    // Write it to localStorage here (this child effect runs before the SettingsProvider's own load
    // effect, so the provider picks the forced value up instead of clobbering it) and reset to the
    // defaults when absent, so a value set by one audit state does not leak into the next (the runner
    // reuses one page, so localStorage persists across navigations).
    try {
      const raw = localStorage.getItem("ruchoir.settings");
      const stored = raw ? JSON.parse(raw) : {};
      localStorage.setItem(
        "ruchoir.settings",
        JSON.stringify({ ...stored, textSize: link.text ?? "m", font: link.font ?? "plex" }),
      );
    } catch {
      // ignore storage failures (dev-only affordance)
    }
    // Dev-only: open a click-only popover on load (audit coverage). Set in the effect, NOT during
    // render, so the server and first client render match (reading it at render time would open the
    // popover only on the client -> hydration mismatch).
    if (link.pop) setDeepLinkPop(link.pop);
    /* eslint-enable react-hooks/set-state-in-effect */
    // Run once on mount; deep-link is an entry point, not a live binding.
  }, []);

  const dm = dms.find((d) => d.id === channelId) ?? null;
  const chan: Channel =
    channels.find((c) => c.id === channelId) ??
    ({ id: channelId, name: dm?.name ?? "général", fav: false, unread: 0, type: "public" } as Channel);
  const feed = messages[channelId] ?? [];

  const people = useMemo(() => getChannelMembers(), []);
  const saved = collectSaved(messages, channels, dms);
  const mentions = collectMentions(messages, channels, dms, currentUser);
  const threads = collectThreads(messages, channels, dms);

  // Notifications the user should actually see, after applying the per-channel and global preferences.
  const visibleNotifs = useMemo(
    () => notifs.filter((n) => passesPref(n, channelPrefs[n.channelId], settings.notif)),
    [notifs, channelPrefs, settings.notif],
  );
  const notifUnread = visibleNotifs.filter((n) => !n.read).length;

  const setNotifRead = (id: string, read: boolean) =>
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read } : n)));
  const markAllNotifsRead = () => setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  const saveChannelPref = (id: string, pref: ChannelNotifPref) =>
    setChannelPrefs((prev) => ({ ...prev, [id]: pref }));

  /** Mark a whole conversation read: clears its unread badge and any pending notifications from it. */
  const markConversationRead = (id: string) => {
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    setDms((prev) => prev.map((d) => (d.id === id ? { ...d, unread: 0 } : d)));
    setNotifs((prev) => prev.map((n) => (n.channelId === id ? { ...n, read: true } : n)));
  };

  /** Jump to the next (dir 1) or previous (dir -1) unread conversation, channels then DMs, cyclically. */
  const gotoUnread = (dir: 1 | -1) => {
    const ids = [...channels, ...dms].filter((c) => c.unread > 0).map((c) => c.id);
    if (ids.length === 0) {
      showToast({ tone: "info", title: "Aucune conversation non lue" });
      return;
    }
    const cur = ids.indexOf(channelId);
    const next = cur === -1 ? (dir === 1 ? 0 : ids.length - 1) : (cur + dir + ids.length) % ids.length;
    openChannel(ids[next]);
  };

  const showToast = (t: Toast) => {
    setToast(t);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  /** Open the full-screen preferences on a given section, remembering the current view so closing returns to it. */
  const openPreferences = (tab: PrefTab = "appearance") => {
    setModal(null);
    setPrefsTab(tab);
    if (view !== "prefs") setPrevView(view);
    // Preferences are a full-screen overlay: leave the underlying view, panel and thread untouched so
    // closing them returns to exactly where the user was (with the right panel still open).
    setView("prefs");
    // Compact shell: push the view full-screen over the tab list and close the rail drawer.
    setMobileContent(true);
    setRailOpen(false);
  };

  const openChannel = (id: string) => {
    setView("channel");
    setChannelId(id);
    // Right panel is app-level state, so reset it per conversation. On desktop a channel opens with its
    // members panel and a DM with its files panel by default; the compact shell opens with no panel
    // (there the panel is a full-screen overlay that would hide the conversation). Once the user has
    // closed the panel by hand, respect that and keep it closed.
    const isChannel = channels.some((c) => c.id === id);
    setPanel(compact || panelDismissed ? null : isChannel ? "members" : "files");
    setThread(null);
    setProfile(null);
    setProfileEdit(false);
    setUnreadMarker(null);
    setFocusMessageId(null);
  };

  /** Switch the right panel, closing the thread and profile views so it is visible. */
  const openPanel = (next: ChannelPanel) => {
    setPanel(next);
    // Closing the panel (next === null) is a manual dismissal; opening one re-engages the auto-default.
    setPanelDismissed(next === null);
    setThread(null);
    setProfile(null);
  };

  const updateMessage = (targetChannel: string, messageId: number, updater: (m: Message) => Message) => {
    setMessages((prev) => {
      const list = prev[targetChannel] ?? [];
      return { ...prev, [targetChannel]: list.map((m) => (m.id === messageId ? updater(m) : m)) };
    });
  };

  /** Open (or create) a direct message with a person, then navigate to it. */
  const openDmByName = (name: string) => {
    setModal(null);
    const existing = dms.find((d) => d.name === name);
    if (existing) {
      openChannel(existing.id);
      return;
    }
    const id = uniqueId(name, [...dms.map((d) => d.id), ...channels.map((c) => c.id)]);
    setDms((prev) => [...prev, { id, name, presence: getPresence(name), unread: 0 }]);
    setMessages((prev) => ({ ...prev, [id]: [] }));
    openChannel(id);
  };

  const openMessage = (targetChannel: string, messageId: number) => {
    setModal(null);
    openChannel(targetChannel);
    setFocusMessageId(messageId);
  };

  /** Open a notification: mark it read, then jump to its source message. */
  const openNotification = (targetChannel: string, messageId: number, id: string) => {
    setNotifRead(id, true);
    openMessage(targetChannel, messageId);
  };

  const messageActions = {
    react: (messageId: number, emoji: string) =>
      updateMessage(channelId, messageId, (m) => {
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
    message: (name: string) => openDmByName(name),
    toggleSave: (messageId: number) => {
      const nowSaved = !(feed.find((x) => x.id === messageId)?.saved ?? false);
      updateMessage(channelId, messageId, (m) => ({ ...m, saved: nowSaved }));
      showToast({
        tone: nowSaved ? "success" : "info",
        title: nowSaved ? "Message enregistré" : "Retiré des enregistrés",
      });
    },
    edit: (messageId: number) => {
      const target = feed.find((x) => x.id === messageId);
      if (target) setEditing({ id: messageId, body: target.body });
    },
    togglePin: (messageId: number) => {
      const nowPinned = !(feed.find((x) => x.id === messageId)?.pinned ?? false);
      updateMessage(channelId, messageId, (m) => ({ ...m, pinned: nowPinned }));
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
      updateMessage(channelId, messageId, (m) => ({ ...m, deleted: true }));
      showToast({ tone: "info", title: "Message supprimé" });
    },
  };

  const send = (text: string, attachment?: Message["attachment"]) => {
    if (!text.trim() && !attachment) return;
    const message: Message = {
      id: Date.now(),
      author: currentUser,
      time: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      body: text,
      attachment,
    };
    setMessages((prev) => ({ ...prev, [channelId]: [...(prev[channelId] ?? []), message] }));
  };

  const saveEdit = () => {
    if (!editing) return;
    updateMessage(channelId, editing.id, (m) => ({ ...m, body: editing.body, edited: true }));
    setEditing(null);
    showToast({ tone: "success", title: "Message modifié" });
  };

  // Domain mutations wired to the creation dialogs.
  const createChannel = ({ name, type, topic }: { name: string; type: Channel["type"]; topic: string }) => {
    const id = uniqueId(name, [...channels.map((c) => c.id), ...dms.map((d) => d.id)]);
    setChannels((prev) => [...prev, { id, name, fav: false, unread: 0, type, topic }]);
    setMessages((prev) => ({ ...prev, [id]: [] }));
    setModal(null);
    openChannel(id);
    showToast({ tone: "success", title: "Canal créé", description: `#${name}` });
  };

  const updateChannel = (id: string, patch: Partial<Channel>) =>
    setChannels((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const leaveChannel = (id: string) => {
    setChannels((prev) => prev.filter((c) => c.id !== id));
    const fallback = channels.find((c) => c.id !== id)?.id ?? "general";
    openChannel(fallback);
    showToast({ tone: "info", title: "Canal quitté" });
  };

  const createWorkspace = (name: string) => {
    const id = uniqueId(name, workspaces.map((w) => w.id));
    setWorkspaces((prev) => [...prev, { id, name, members: 1 }]);
    setWs(id);
    setModal(null);
    showToast({ tone: "success", title: "Espace créé", description: name });
  };

  const createFolder = (name: string) =>
    setFiles((prev) => [
      { name, kind: "folder", size: "0 élément", by: currentUser, when: "À l'instant", source: "Ruchoir", version: "" },
      ...prev,
    ]);

  const uploadFile = (file: SpaceFile) => setFiles((prev) => [file, ...prev]);

  // Global keyboard shortcuts, using the user's (customizable) bindings. Suspended whenever a modal,
  // dialog, the preferences overlay or the login flow is up, so their own key handling wins.
  const shortcutsEnabled =
    authStage === "app" &&
    modal === null &&
    view !== "prefs" &&
    editing === null &&
    channelSettingsId === null &&
    channelNotifId === null;
  useGlobalShortcuts(
    settings.shortcuts,
    {
      search: () => setModal("search"),
      switcher: () => setModal("switcher"),
      newMessage: () => setModal("newMessage"),
      nextUnread: () => gotoUnread(1),
      prevUnread: () => gotoUnread(-1),
      markRead: () => {
        if (view === "channel") markConversationRead(channelId);
      },
      help: () => setModal("help"),
    },
    shortcutsEnabled,
  );

  if (authStage !== "app") {
    return (
      <div style={{ height: "var(--ui-vh)", display: "flex", flexDirection: "column", overflow: "auto", background: "var(--surface-canvas)" }}>
        {authStage === "login" ? (
          <LoginScreen
            onSubmit={() => {
              setAuthStage("app");
              showToast({ tone: "success", title: "Connecté", description: "Bienvenue sur Atelier Nantes." });
            }}
            onCreateAccount={() => setAuthStage("signup")}
          />
        ) : null}
        {authStage === "signup" ? (
          <SignupScreen
            onSubmit={(first) => {
              setSignupFirst(first);
              setAuthStage("onboarding");
            }}
            onBackToLogin={() => setAuthStage("login")}
          />
        ) : null}
        {authStage === "onboarding" ? (
          <OnboardingFlow
            firstName={signupFirst}
            onFinish={({ workspaceName }) => {
              const id = uniqueId(workspaceName, workspaces.map((w) => w.id));
              setWorkspaces((prev) => [...prev, { id, name: workspaceName, members: 1 }]);
              setWs(id);
              setAuthStage("app");
              showToast({ tone: "success", title: "Espace créé", description: workspaceName });
            }}
          />
        ) : null}
      </div>
    );
  }

  const wsName = (getWorkspace(ws) ?? workspaces.find((w) => w.id === ws))?.name ?? "espace";
  const contentTitles: Record<string, string> = {
    files: "Fichiers de l'espace",
    settings: "Réglages de l'espace",
    prefs: "Préférences",
    threads: "Fils de discussion",
    mentions: "Mentions",
    saved: "Enregistrés",
  };
  const contentTitle = view === "channel" ? (dm ? dm.name : `# ${chan.name}`) : (contentTitles[view] ?? wsName);
  const mobileTabs = [
    { id: "channels", label: "Canaux", icon: "hash" },
    { id: "messages", label: "Messages", icon: "message-square" },
    { id: "activity", label: "Activité", icon: "bell", badge: notifUnread || undefined },
    { id: "search", label: "Recherche", icon: "search" },
  ];

  const rail = (
    <WorkspaceRail
      workspaces={workspaces}
      active={ws}
      currentUser={currentUser}
      onSelect={(id) => {
        setWs(id);
        setRailOpen(false);
      }}
      onNew={() => setModal("newWorkspace")}
      onHelp={() => setModal("help")}
      onLogout={() => setAuthStage("login")}
      presence={myPresence}
      onSetPresence={(p) => {
        setUserPresence(currentUser, p);
        setMyPresence(p);
      }}
      onOpenSettings={() => openPreferences()}
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
  );

  const desktopSidebar = (
    <Sidebar
        workspace={getWorkspace(ws) ?? workspaces.find((w) => w.id === ws)}
        channels={channels}
        directMessages={dms}
        view={view}
        channel={channelId}
        mentionCount={mentions.length}
        channelPrefs={channelPrefs}
        notifications={visibleNotifs}
        notifUnread={notifUnread}
        onView={setView}
        onChannel={openChannel}
        onNotify={showToast}
        onImport={() => setModal("import")}
        onInvite={() => setModal("invite")}
        onNewChannel={() => setModal("newChannel")}
        onNewMessage={() => setModal("newMessage")}
        onGlobalSearch={() => setModal("search")}
        onLeaveChannel={leaveChannel}
        onChannelSettings={setChannelSettingsId}
        onChannelNotifications={setChannelNotifId}
        onMarkRead={markConversationRead}
        onOpenNotification={openNotification}
        onToggleNotifRead={setNotifRead}
        onMarkAllNotifsRead={markAllNotifsRead}
        onOpenNotifPrefs={() => openPreferences("notifications")}
        onLogout={() => setAuthStage("login")}
        openNotifications={deepLinkPop === "notifications"}
      />
  );

  const content = (
    // The main landmark: screen-reader users jump here to skip the rail and channel list. Exactly one
    // view renders at a time, so there is always exactly one main. Flex container so the view fills it
    // in both the desktop row shell and the compact column shell.
    <main
      aria-label="Contenu principal"
      style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}
    >
      {view === "channel" ? (
        <ChannelScreen
          channel={chan}
          dm={dm}
          messages={feed}
          panel={panel}
          threadId={thread}
          profileName={profile}
          profileEditing={profileEdit}
          unreadMarker={unreadMarker}
          focusMessageId={focusMessageId}
          compact={compact}
          onSend={send}
          onPanel={openPanel}
          onCloseThread={() => setThread(null)}
          onCloseProfile={() => setProfile(null)}
          onNotify={showToast}
          onUpdateChannel={(patch) => updateChannel(channelId, patch)}
          onLeaveChannel={() => leaveChannel(channelId)}
          notifPref={channelPrefs[channelId] ?? DEFAULT_CHANNEL_PREF}
          onSaveNotifPref={(pref) => saveChannelPref(channelId, pref)}
          actions={messageActions}
        />
      ) : null}
      {view === "files" ? (
        <FilesScreen
          files={files}
          workspaceName={(getWorkspace(ws) ?? workspaces.find((w) => w.id === ws))?.name ?? "espace"}
          currentUser={currentUser}
          compact={compact}
          onNewFolder={createFolder}
          onUpload={uploadFile}
          onNotify={showToast}
        />
      ) : null}
      {view === "settings" ? (
        <WorkspaceSettings
          workspaceName={(getWorkspace(ws) ?? workspaces.find((w) => w.id === ws))?.name ?? "espace"}
          members={people.filter((p) => !p.bot).map((p) => ({ name: p.name, presence: p.presence }))}
          compact={compact}
          onInvite={() => setModal("invite")}
          onNotify={showToast}
        />
      ) : null}
      {view === "threads" ? <ActivityView kind="threads" items={threads} onOpen={openMessage} /> : null}
      {view === "mentions" ? <ActivityView kind="mentions" items={mentions} onOpen={openMessage} /> : null}
      {view === "saved" ? <ActivityView kind="saved" items={saved} onOpen={openMessage} /> : null}
    </main>
  );

  const overlays = (
    <>
      {/* Personal preferences take over the whole viewport (covering the rail and sidebar) so it is
          clear they are account-wide, not scoped to the current workspace. Sits below toasts (z 60)
          and dialogs (z 90) so the security sub-dialogs still layer on top. */}
      {view === "prefs" ? (
        <div style={{ position: "fixed", top: 0, left: 0, width: "var(--ui-vw)", height: "var(--ui-vh)", zIndex: 50, display: "flex", flexDirection: "column", background: "var(--surface-canvas)" }}>
          <PreferencesScreen compact={compact} initialTab={prefsTab} onClose={() => setView(prevView)} onNotify={showToast} />
        </div>
      ) : null}
      {modal === "import" ? (
        <ImportDialog
          onClose={() => setModal(null)}
          onDone={(source) => {
            setModal(null);
            showToast({ tone: "success", title: "Import lancé", description: `Reprise depuis ${source} en arrière-plan.` });
          }}
        />
      ) : null}
      {modal === "newChannel" ? <NewChannelDialog onClose={() => setModal(null)} onCreate={createChannel} /> : null}
      {modal === "newMessage" ? (
        <NewMessageDialog people={people} onClose={() => setModal(null)} onSelect={openDmByName} />
      ) : null}
      {modal === "invite" ? (
        <InviteDialog
          onClose={() => setModal(null)}
          onInvite={(count) => {
            setModal(null);
            showToast({ tone: "success", title: `${count} invitation${count > 1 ? "s" : ""} envoyée${count > 1 ? "s" : ""}` });
          }}
        />
      ) : null}
      {modal === "newWorkspace" ? <NewWorkspaceDialog onClose={() => setModal(null)} onCreate={createWorkspace} /> : null}
      {modal === "help" ? (
        <HelpDialog onClose={() => setModal(null)} onCustomize={() => openPreferences("shortcuts")} />
      ) : null}
      {modal === "switcher" ? (
        <QuickSwitcher
          channels={channels}
          dms={dms}
          onClose={() => setModal(null)}
          onOpen={(id) => {
            setModal(null);
            openChannel(id);
          }}
        />
      ) : null}
      {modal === "search" ? (
        <GlobalSearchDialog
          messages={flattenMessages(messages, channels, dms)}
          files={files}
          people={people}
          onClose={() => setModal(null)}
          onOpenMessage={openMessage}
          onOpenFile={() => {
            setModal(null);
            setView("files");
          }}
          onOpenProfile={(name) => {
            setModal(null);
            setView("channel");
            setThread(null);
            setProfileEdit(false);
            setProfile(name);
          }}
        />
      ) : null}

      {channelSettingsId && channels.find((c) => c.id === channelSettingsId) ? (
        <ChannelSettingsDialog
          channel={channels.find((c) => c.id === channelSettingsId)!}
          onClose={() => setChannelSettingsId(null)}
          onUpdate={(patch) => updateChannel(channelSettingsId, patch)}
          onNotify={showToast}
        />
      ) : null}

      {channelNotifId ? (
        <ChannelNotificationsDialog
          channelName={
            channels.find((c) => c.id === channelNotifId)?.name ??
            dms.find((d) => d.id === channelNotifId)?.name ??
            channelNotifId
          }
          isDm={!channels.some((c) => c.id === channelNotifId) && dms.some((d) => d.id === channelNotifId)}
          value={channelPrefs[channelNotifId] ?? DEFAULT_CHANNEL_PREF}
          onClose={() => setChannelNotifId(null)}
          onSave={(pref) => saveChannelPref(channelNotifId, pref)}
          onNotify={showToast}
        />
      ) : null}

      {editing ? (
        <Dialog
          title="Modifier le message"
          size="md"
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)}>Annuler</Button>
              <Button variant="primary" onClick={saveEdit}>
                Enregistrer
              </Button>
            </>
          }
        >
          <Textarea
            rows={4}
            autoFocus
            value={editing.body}
            onChange={(e) => setEditing({ ...editing, body: e.target.value })}
          />
        </Dialog>
      ) : null}

      {toast ? (
        <div style={toastStyle.wrap} role="status" aria-live="polite">
          <div style={toastStyle.card}>
            <span style={toastStyle.title}>{toast.title}</span>
            {toast.description ? <span style={toastStyle.desc}>{toast.description}</span> : null}
          </div>
        </div>
      ) : null}
    </>
  );

  if (compact) {
    return (
      <>
        <div style={{ height: "var(--ui-vh)", display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--surface-canvas)" }}>
          <MobileTopBar
            title={mobileContent ? contentTitle : wsName}
            workspaceName={wsName}
            onBack={mobileContent ? () => setMobileContent(false) : undefined}
            onOpenRail={() => setRailOpen(true)}
            onSearch={() => setModal("search")}
            onCompose={() => setModal("newMessage")}
          />
          <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {mobileContent ? (
              content
            ) : (
              // The mobile list screen is a main landmark; a visually-hidden h1 gives the screen reader
              // a heading to land on (the top bar shows the same name visually).
              <main style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <h1
                  style={{ position: "absolute", width: 1, height: 1, padding: 0, margin: -1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 }}
                >
                  {wsName}
                </h1>
                <Sidebar
                  workspace={getWorkspace(ws) ?? workspaces.find((w) => w.id === ws)}
                channels={channels}
                directMessages={dms}
                view={view}
                channel={channelId}
                mentionCount={mentions.length}
                channelPrefs={channelPrefs}
                notifications={visibleNotifs}
                notifUnread={notifUnread}
                compact
                only={mobileTab}
                onView={(v) => {
                  setView(v);
                  setMobileContent(true);
                }}
                onChannel={(id) => {
                  openChannel(id);
                  setMobileContent(true);
                }}
                onNotify={showToast}
                onImport={() => setModal("import")}
                onInvite={() => setModal("invite")}
                onNewChannel={() => setModal("newChannel")}
                onNewMessage={() => setModal("newMessage")}
                onGlobalSearch={() => setModal("search")}
                onLeaveChannel={leaveChannel}
                onChannelSettings={setChannelSettingsId}
                onChannelNotifications={setChannelNotifId}
                onMarkRead={markConversationRead}
                onOpenNotification={openNotification}
                onToggleNotifRead={setNotifRead}
                onMarkAllNotifsRead={markAllNotifsRead}
                onOpenNotifPrefs={() => openPreferences("notifications")}
                onLogout={() => setAuthStage("login")}
                />
              </main>
            )}
          </div>
          <BottomTabs
            tabs={mobileTabs}
            active={mobileTab}
            onSelect={(id) => {
              if (id === "search") {
                setModal("search");
                return;
              }
              setMobileTab(id as "channels" | "messages" | "activity");
              setMobileContent(false);
            }}
          />
        </div>
        <Drawer open={railOpen} onClose={() => setRailOpen(false)} side="left" width={72} label="Espaces de travail">
          {rail}
        </Drawer>
        {overlays}
      </>
    );
  }

  return (
    <div style={{ height: "var(--ui-vh)", display: "flex", overflow: "hidden", background: "var(--surface-canvas)" }}>
      {rail}
      {desktopSidebar}
      {content}
      {overlays}
    </div>
  );
}
