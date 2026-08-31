"use client";

import { type CSSProperties, useState } from "react";
import { Button, Checkbox, Field, Input } from "@/components/ds";
import { AuthShell } from "./AuthShell";

const styles: Record<string, CSSProperties> = {
  title: { fontSize: 20, fontWeight: 600, letterSpacing: "var(--tracking-tight)", color: "var(--text-strong)" },
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 4, marginBottom: 20 },
  fields: { display: "flex", flexDirection: "column", gap: 14 },
  optionRow: { display: "flex", alignItems: "center", justifyContent: "space-between" },
  divider: { display: "flex", alignItems: "center", gap: 12, margin: "18px 0" },
  dividerLine: { flex: 1, height: 1, background: "var(--border-default)" },
  dividerLabel: {
    fontSize: 11,
    letterSpacing: "var(--tracking-caps)",
    textTransform: "uppercase",
    color: "var(--text-subtle)",
  },
};

/** The sign-in screen: a centered card, faithful to common team-app login patterns. */
export function LoginScreen({ onSubmit, onCreateAccount }: { onSubmit: () => void; onCreateAccount: () => void }) {
  const [server, setServer] = useState("atelier.ruchoir.fr");
  const [mail, setMail] = useState("camille@atelier-nantes.fr");

  return (
    <AuthShell
      footer={
        <>
          Pas encore de compte ?{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onCreateAccount();
            }}
            style={{ color: "var(--text-accent)", fontWeight: 500 }}
          >
            Créer un compte
          </a>
          <div style={{ marginTop: 10, color: "var(--text-subtle)" }}>Hébergement en France, données chez vous.</div>
        </>
      }
    >
      <div style={styles.title}>Connexion</div>
      <p style={styles.subtitle}>Connectez-vous au serveur de votre organisation.</p>
      <form
        style={styles.fields}
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <Field label="Serveur" hint="Adresse fournie par votre administrateur" htmlFor="srv">
          <Input id="srv" size="lg" icon="server" value={server} onChange={(e) => setServer(e.target.value)} />
        </Field>
        <Field label="Adresse électronique" htmlFor="mail">
          <Input id="mail" size="lg" type="email" icon="mail" value={mail} onChange={(e) => setMail(e.target.value)} />
        </Field>
        <Field label="Mot de passe" htmlFor="pw">
          <Input id="pw" size="lg" type="password" icon="lock" defaultValue="mot-de-passe" />
        </Field>
        <div style={styles.optionRow}>
          <Checkbox label="Rester connecté" defaultChecked />
          <a href="#" style={{ fontSize: 13 }} onClick={(e) => e.preventDefault()}>
            Mot de passe oublié ?
          </a>
        </div>
        <Button variant="primary" size="lg" fullWidth type="submit">
          Se connecter
        </Button>
      </form>
      <div style={styles.divider}>
        <span style={styles.dividerLine} />
        <span style={styles.dividerLabel}>ou</span>
        <span style={styles.dividerLine} />
      </div>
      <Button size="lg" fullWidth iconLeft="key-round" onClick={onSubmit}>
        Authentification unique (SSO)
      </Button>
    </AuthShell>
  );
}
