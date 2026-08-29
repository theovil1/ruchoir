import { type CSSProperties, useRef, useState } from "react";
import { Avatar, IconButton, Tooltip } from "@/components/ds";
import type { Presence } from "@/components/ds";
import type { Workspace } from "@/lib/data";
import type { Toast } from "./types";
import { UserMenu } from "./UserMenu";

const rail: CSSProperties = {
  width: "var(--rail-width)",
  flex: "none",
  background: "var(--grey-100)",
  borderRight: "1px solid var(--border-subtle)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  padding: "8px 0",
  gap: 6,
};

function wsButton(on: boolean): CSSProperties {
  return {
    width: 40,
    height: 40,
    borderRadius: "var(--radius-md)",
    border: 0,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    background: "transparent",
    boxShadow: on ? "0 0 0 2px var(--terracotta-500)" : "none",
    transition: "box-shadow var(--duration-fast) var(--ease-out)",
  };
}

export type WorkspaceRailProps = {
  workspaces: Workspace[];
  active: string;
  currentUser: string;
  presence: Presence;
  onSelect: (id: string) => void;
  onNew: () => void;
  onNotify: (toast: Toast) => void;
  onSetPresence: (p: Presence) => void;
  onOpenOwnProfile: () => void;
  onEditOwnProfile: () => void;
  onOpenSettings: () => void;
};

/** Left-most rail: one square per workspace, plus help and the signed-in user. */
export function WorkspaceRail({
  workspaces,
  active,
  currentUser,
  presence,
  onSelect,
  onNew,
  onNotify,
  onSetPresence,
  onOpenOwnProfile,
  onEditOwnProfile,
  onOpenSettings,
}: WorkspaceRailProps) {
  const [userMenu, setUserMenu] = useState(false);
  const userRef = useRef<HTMLButtonElement>(null);
  const soon = (title: string) => onNotify({ tone: "info", title, description: "À venir dans un prochain lot." });

  return (
    <div style={rail}>
      {workspaces.map((w) => (
        <Tooltip key={w.id} label={w.name} side="right">
          <button style={wsButton(w.id === active)} onClick={() => onSelect(w.id)}>
            <Avatar name={w.name} kind="workspace" size={36} />
          </button>
        </Tooltip>
      ))}
      <Tooltip label="Nouvel espace" side="right">
        <IconButton icon="plus" label="Nouvel espace" onClick={onNew} />
      </Tooltip>
      <div style={{ flex: 1 }} />
      <Tooltip label="Aide" side="right">
        <IconButton icon="life-buoy" label="Aide" onClick={() => soon("Aide")} />
      </Tooltip>
      <Tooltip label="Mon profil" side="right">
        <button
          ref={userRef}
          onClick={() => setUserMenu((o) => !o)}
          aria-label="Mon profil et statut"
          aria-expanded={userMenu}
          style={{ border: 0, background: "none", padding: 0, cursor: "pointer" }}
        >
          <Avatar name={currentUser} size={36} presence={presence} />
        </button>
      </Tooltip>
      <UserMenu
        currentUser={currentUser}
        presence={presence}
        anchorRef={userRef}
        open={userMenu}
        onClose={() => setUserMenu(false)}
        onSetPresence={onSetPresence}
        onOpenProfile={onOpenOwnProfile}
        onEditProfile={onEditOwnProfile}
        onOpenSettings={onOpenSettings}
        onNotify={onNotify}
      />
    </div>
  );
}
