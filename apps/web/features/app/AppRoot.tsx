"use client";

import { type CSSProperties, useMemo, useRef, useState } from "react";
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
import { Button, Dialog, Textarea } from "@/components/ds";
import type { Presence } from "@/components/ds";
import { ChannelScreen } from "@/features/channel/ChannelScreen";
import { ChannelSettingsDialog } from "@/features/channel/ChannelDialogs";
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

type Modal = "prefs" | "import" | "newChannel" | "newMessage" | "invite" | "newWorkspace" | "help" | "search" | null;

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

  const [ws, setWs] = useState("atelier");
  const [view, setView] = useState<AppView>("channel");
  const [channelId, setChannelId] = useState("compta");
  const [panel, setPanel] = useState<ChannelPanel>("files");
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
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const dm = dms.find((d) => d.id === channelId) ?? null;
  const chan: Channel =
    channels.find((c) => c.id === channelId) ??
    ({ id: channelId, name: dm?.name ?? "général", fav: false, unread: 0, type: "public" } as Channel);
  const feed = messages[channelId] ?? [];

  const people = useMemo(() => getChannelMembers(), []);
  const saved = collectSaved(messages, channels, dms);
  const mentions = collectMentions(messages, channels, dms, currentUser);
  const threads = collectThreads(messages, channels, dms);

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
    setFocusMessageId(null);
  };

  /** Switch the right panel, closing the thread and profile views so it is visible. */
  const openPanel = (next: ChannelPanel) => {
    setPanel(next);
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
      { name, kind: "folder", size: "0 élément", by: currentUser, when: "À l'instant", source: "Workchat", version: "" },
      ...prev,
    ]);

  const uploadFile = (file: SpaceFile) => setFiles((prev) => [file, ...prev]);

  if (authStage !== "app") {
    return (
      <div style={{ height: "100vh", display: "flex", overflow: "auto", background: "var(--surface-canvas)" }}>
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

  return (
    <div style={{ height: "100vh", display: "flex", overflow: "hidden", background: "var(--surface-canvas)" }}>
      <WorkspaceRail
        workspaces={workspaces}
        active={ws}
        currentUser={currentUser}
        onSelect={setWs}
        onNew={() => setModal("newWorkspace")}
        onHelp={() => setModal("help")}
        onLogout={() => setAuthStage("login")}
        presence={myPresence}
        onSetPresence={(p) => {
          setUserPresence(currentUser, p);
          setMyPresence(p);
        }}
        onOpenSettings={() => setModal("prefs")}
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
        workspace={getWorkspace(ws) ?? workspaces.find((w) => w.id === ws)}
        channels={channels}
        directMessages={dms}
        view={view}
        channel={channelId}
        mentionCount={mentions.length}
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
        onLogout={() => setAuthStage("login")}
      />

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
          onSend={send}
          onPanel={openPanel}
          onCloseThread={() => setThread(null)}
          onCloseProfile={() => setProfile(null)}
          onNotify={showToast}
          onUpdateChannel={(patch) => updateChannel(channelId, patch)}
          onLeaveChannel={() => leaveChannel(channelId)}
          actions={messageActions}
        />
      ) : null}
      {view === "files" ? (
        <FilesScreen
          files={files}
          workspaceName={(getWorkspace(ws) ?? workspaces.find((w) => w.id === ws))?.name ?? "espace"}
          currentUser={currentUser}
          onNewFolder={createFolder}
          onUpload={uploadFile}
          onNotify={showToast}
        />
      ) : null}
      {view === "settings" ? (
        <WorkspaceSettings
          workspaceName={(getWorkspace(ws) ?? workspaces.find((w) => w.id === ws))?.name ?? "espace"}
          members={people.filter((p) => !p.bot).map((p) => ({ name: p.name, presence: p.presence }))}
          onInvite={() => setModal("invite")}
          onNotify={showToast}
        />
      ) : null}
      {view === "threads" ? <ActivityView kind="threads" items={threads} onOpen={openMessage} /> : null}
      {view === "mentions" ? <ActivityView kind="mentions" items={mentions} onOpen={openMessage} /> : null}
      {view === "saved" ? <ActivityView kind="saved" items={saved} onOpen={openMessage} /> : null}

      {modal === "prefs" ? <SettingsDialog onClose={() => setModal(null)} /> : null}
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
      {modal === "help" ? <HelpDialog onClose={() => setModal(null)} /> : null}
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
    </div>
  );
}
