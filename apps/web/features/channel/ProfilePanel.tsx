"use client";

import { type CSSProperties, type ReactNode, useState } from "react";
import { Avatar, Button, Icon, IconButton, Input, Textarea } from "@/components/ds";
import { getCurrentUser, getProfile } from "@/lib/data";
import { presenceLabel } from "../app/presence";
import type { Toast } from "../app/types";

const styles: Record<string, CSSProperties> = {
  panel: {
    width: "var(--panel-width)",
    flex: "none",
    borderLeft: "1px solid var(--border-subtle)",
    background: "var(--surface-chrome)",
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
    padding: "0 8px 0 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-strong)" },
  scroll: { flex: 1, overflow: "auto" },
  hero: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    gap: 6,
    padding: "24px 16px 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  section: { padding: "14px 16px", borderBottom: "1px solid var(--border-subtle)" },
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "var(--tracking-caps)",
    textTransform: "uppercase",
    color: "var(--text-subtle)",
    marginBottom: 8,
  },
  field: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--text-body)", padding: "3px 0" },
  formLabel: { display: "block", fontSize: 12, color: "var(--text-muted)", margin: "10px 0 4px" },
};

function Field({ icon, children }: { icon: string; children: ReactNode }) {
  return (
    <div style={styles.field}>
      <Icon name={icon} size={15} style={{ color: "var(--text-muted)" }} />
      <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{children}</span>
    </div>
  );
}

export type ProfilePanelProps = {
  name: string;
  startEditing?: boolean;
  onClose: () => void;
  onMessage: () => void;
  onNotify: (toast: Toast) => void;
};

/** Full user profile in the right sidebar. Editable when it is the current user's own profile. */
export function ProfilePanel({ name, startEditing, onClose, onMessage, onNotify }: ProfilePanelProps) {
  const p = getProfile(name);
  const isOwn = name === getCurrentUser().name;
  const [editing, setEditing] = useState(!!startEditing && isOwn);
  const [role, setRole] = useState(p.role);
  const [pronouns, setPronouns] = useState(p.pronouns ?? "");
  const [bio, setBio] = useState(p.bio ?? "");

  const save = () => {
    setEditing(false);
    onNotify({ tone: "success", title: "Profil mis à jour" });
  };

  return (
    <div style={styles.panel}>
      <div style={styles.head}>
        <span style={styles.title}>{isOwn ? "Mon profil" : "Profil"}</span>
        <IconButton icon="x" label="Fermer le profil" size="sm" onClick={onClose} />
      </div>
      <div style={styles.scroll}>
        <div style={styles.hero}>
          <Avatar name={p.name} size={88} presence={p.presence} kind={p.bot ? "bot" : "person"} />
          <div style={{ fontSize: 20, fontWeight: 600, color: "var(--text-strong)", marginTop: 4 }}>{p.name}</div>
          <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
            {role}
            {pronouns ? ` · ${pronouns}` : ""}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--text-muted)", marginTop: 2 }}>
            <span style={{ width: 9, height: 9, borderRadius: "var(--radius-full)", background: `var(--presence-${p.presence})` }} />
            {presenceLabel(p.presence)}
          </div>
          <div style={{ marginTop: 10, width: "100%" }}>
            {isOwn ? (
              editing ? null : (
                <Button variant="secondary" size="md" iconLeft="square-pen" onClick={() => setEditing(true)} fullWidth>
                  Modifier le profil
                </Button>
              )
            ) : (
              <Button variant="primary" size="md" iconLeft="message-square" onClick={onMessage} fullWidth>
                Envoyer un message
              </Button>
            )}
          </div>
        </div>

        {isOwn && editing ? (
          <div style={styles.section}>
            <div style={styles.label}>Modifier</div>
            <label style={styles.formLabel}>Rôle</label>
            <Input value={role} onChange={(e) => setRole(e.target.value)} />
            <label style={styles.formLabel}>Pronoms</label>
            <Input value={pronouns} onChange={(e) => setPronouns(e.target.value)} placeholder="ex. elle, il, iel" />
            <label style={styles.formLabel}>À propos</label>
            <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Button variant="primary" size="sm" onClick={save}>
                Enregistrer
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setEditing(false)}>
                Annuler
              </Button>
            </div>
          </div>
        ) : (
          <>
            {bio ? (
              <div style={styles.section}>
                <div style={styles.label}>À propos</div>
                <p style={{ fontSize: 13, color: "var(--text-body)", lineHeight: "var(--leading-snug)" }}>{bio}</p>
              </div>
            ) : null}

            <div style={styles.section}>
              <div style={styles.label}>Coordonnées</div>
              {p.email ? <Field icon="at-sign">{p.email}</Field> : null}
              <Field icon="clock">{p.localTime} heure locale</Field>
              <Field icon="globe">{p.timezone}</Field>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
