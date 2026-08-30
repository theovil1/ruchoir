"use client";

import { type CSSProperties, useState } from "react";
import { Avatar, Button, Dialog, Field, Icon, Input, Radio, Select } from "@/components/ds";
import type { Presence } from "@/components/ds";
import type { ChannelType } from "@/lib/data";

const listItem: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  width: "100%",
  padding: "8px 10px",
  border: 0,
  borderRadius: "var(--radius-md)",
  background: "transparent",
  cursor: "pointer",
  textAlign: "left",
};

/** Create a new channel: name, visibility, optional topic. */
export function NewChannelDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (channel: { name: string; type: ChannelType; topic: string }) => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ChannelType>("public");
  const [topic, setTopic] = useState("");

  const submit = () => {
    const clean = name.trim().replace(/^#/, "");
    if (!clean) return;
    onCreate({ name: clean, type, topic: topic.trim() });
  };

  return (
    <Dialog
      title="Nouveau canal"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={submit}>
            Créer le canal
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Nom du canal" htmlFor="ch-name">
          <Input
            id="ch-name"
            autoFocus
            icon="hash"
            placeholder="ex. lancement-produit"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </Field>
        <Field label="Visibilité">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Radio
              name="ch-type"
              checked={type === "public"}
              onChange={() => setType("public")}
              label="Public"
              description="Tous les membres de l'espace peuvent le rejoindre."
            />
            <Radio
              name="ch-type"
              checked={type === "private"}
              onChange={() => setType("private")}
              label="Privé"
              description="Sur invitation uniquement."
            />
          </div>
        </Field>
        <Field label="Sujet" optional htmlFor="ch-topic">
          <Input id="ch-topic" placeholder="À quoi sert ce canal ?" value={topic} onChange={(e) => setTopic(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Pick a person to start (or open) a direct message with. */
export function NewMessageDialog({
  people,
  onClose,
  onSelect,
}: {
  people: { name: string; presence: Presence; bot?: boolean }[];
  onClose: () => void;
  onSelect: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const rows = people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));

  return (
    <Dialog title="Nouveau message" size="sm" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Input autoFocus icon="search" placeholder="À qui souhaitez-vous écrire ?" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 280, overflow: "auto" }}>
          {rows.map((p) => (
            <button
              key={p.name}
              type="button"
              style={listItem}
              className="wc-listrow"
              onClick={() => onSelect(p.name)}
            >
              <Avatar name={p.name} size={26} presence={p.presence} kind={p.bot ? "bot" : "person"} />
              <span style={{ fontSize: 13, color: "var(--text-strong)" }}>{p.name}</span>
            </button>
          ))}
          {rows.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-muted)", padding: "8px 10px" }}>Personne ne correspond.</p>
          ) : null}
        </div>
      </div>
    </Dialog>
  );
}

/** Invite people to the workspace by email. */
export function InviteDialog({ onClose, onInvite }: { onClose: () => void; onInvite: (count: number) => void }) {
  const [emails, setEmails] = useState("");

  const submit = () => {
    const list = emails
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => s.includes("@"));
    if (list.length === 0) return;
    onInvite(list.length);
  };

  return (
    <Dialog
      title="Inviter des personnes"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" iconLeft="send" onClick={submit}>
            Envoyer les invitations
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <Field label="Adresses électroniques" hint="Séparez les adresses par une virgule ou un retour à la ligne." htmlFor="inv">
          <Input
            id="inv"
            autoFocus
            icon="mail"
            placeholder="prenom@exemple.fr, autre@exemple.fr"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
          />
        </Field>
        <Field label="Rôle à l'arrivée" htmlFor="inv-role">
          <Select id="inv-role" options={["Membre", "Modérateur", "Invité externe"]} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Create a new workspace. */
export function NewWorkspaceDialog({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string) => void }) {
  const [name, setName] = useState("");
  const submit = () => {
    const clean = name.trim();
    if (!clean) return;
    onCreate(clean);
  };

  return (
    <Dialog
      title="Nouvel espace de travail"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={submit}>
            Créer l'espace
          </Button>
        </>
      }
    >
      <Field label="Nom de l'espace" hint="Vous pourrez inviter des membres juste après." htmlFor="ws-name">
        <Input
          id="ws-name"
          autoFocus
          placeholder="ex. Studio Loire"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </Field>
    </Dialog>
  );
}

const SHORTCUTS: [string, string][] = [
  ["Recherche globale", "Ctrl + K"],
  ["Aller à un canal", "Ctrl + J"],
  ["Nouveau message", "Ctrl + Maj + M"],
  ["Message suivant non lu", "Alt + Maj + ↓"],
  ["Marquer comme lu", "Échap"],
];

const HELP_LINKS: [string, string][] = [
  ["Guide de prise en main", "book-open"],
  ["Importer depuis Slack, Mattermost, Nextcloud", "import"],
  ["Raccourcis clavier et astuces", "key-round"],
  ["Contacter le support", "life-buoy"],
];

/** Help centre: documentation links and keyboard shortcuts. */
export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog title="Aide" subtitle="Documentation et raccourcis" size="md" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 18 }}>
        {HELP_LINKS.map(([label, icon]) => (
          <a
            key={label}
            href="#"
            onClick={(e) => e.preventDefault()}
            style={{ ...listItem, textDecoration: "none", color: "var(--text-strong)" }}
            className="wc-listrow"
          >
            <Icon name={icon === "book-open" ? "file-text" : icon} size={16} style={{ color: "var(--text-muted)" }} />
            <span style={{ flex: 1, fontSize: 13 }}>{label}</span>
            <Icon name="external-link" size={13} style={{ color: "var(--text-subtle)" }} />
          </a>
        ))}
      </div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "var(--tracking-caps)",
          textTransform: "uppercase",
          color: "var(--text-subtle)",
          margin: "0 0 8px",
        }}
      >
        Raccourcis clavier
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {SHORTCUTS.map(([label, keys]) => (
          <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 2px" }}>
            <span style={{ fontSize: 13, color: "var(--text-body)" }}>{label}</span>
            <kbd
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--text-muted)",
                background: "var(--grey-100)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "1px 6px",
              }}
            >
              {keys}
            </kbd>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
