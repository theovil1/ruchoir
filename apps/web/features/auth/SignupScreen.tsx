"use client";

import { type CSSProperties, useState } from "react";
import { Button, Checkbox, Field, Icon, Input } from "@/components/ds";
import { AuthShell } from "./AuthShell";

const styles: Record<string, CSSProperties> = {
  title: { fontSize: 20, fontWeight: 600, letterSpacing: "var(--tracking-tight)", color: "var(--text-strong)" },
  subtitle: { fontSize: 13, color: "var(--text-muted)", marginTop: 4, marginBottom: 20 },
  fields: { display: "flex", flexDirection: "column", gap: 14 },
  nameRow: { display: "flex", gap: 10 },
  rules: { display: "flex", flexDirection: "column", gap: 4, marginTop: 2 },
  rule: { display: "flex", alignItems: "center", gap: 6, fontSize: 12 },
};

const RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: "Au moins 8 caractères", test: (pw) => pw.length >= 8 },
  { label: "Une majuscule", test: (pw) => /[A-ZÀ-Ö]/.test(pw) },
  { label: "Un chiffre", test: (pw) => /\d/.test(pw) },
];

/** Account creation screen, faithful to common team-app sign-up patterns. */
export function SignupScreen({
  onSubmit,
  onBackToLogin,
}: {
  onSubmit: (firstName: string) => void;
  onBackToLogin: () => void;
}) {
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [mail, setMail] = useState("");
  const [pw, setPw] = useState("");
  const [agreed, setAgreed] = useState(false);

  const pwValid = RULES.every((r) => r.test(pw));
  const canSubmit = first.trim() !== "" && mail.includes("@") && pwValid && agreed;

  return (
    <AuthShell
      footer={
        <>
          Déjà un compte ?{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onBackToLogin();
            }}
            style={{ color: "var(--text-accent)", fontWeight: 500 }}
          >
            Se connecter
          </a>
        </>
      }
    >
      <div style={styles.title}>Créer votre compte</div>
      <p style={styles.subtitle}>Un compte Workchat, hébergé par votre organisation.</p>
      <form
        style={styles.fields}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onSubmit(first.trim());
        }}
      >
        <div style={styles.nameRow}>
          <Field label="Prénom" htmlFor="first" style={{ flex: 1, minWidth: 0 }}>
            <Input id="first" size="lg" value={first} onChange={(e) => setFirst(e.target.value)} autoFocus />
          </Field>
          <Field label="Nom" optional htmlFor="last" style={{ flex: 1, minWidth: 0 }}>
            <Input id="last" size="lg" value={last} onChange={(e) => setLast(e.target.value)} />
          </Field>
        </div>
        <Field label="Adresse électronique" htmlFor="s-mail">
          <Input id="s-mail" size="lg" type="email" icon="mail" value={mail} onChange={(e) => setMail(e.target.value)} />
        </Field>
        <Field label="Mot de passe" htmlFor="s-pw">
          <Input id="s-pw" size="lg" type="password" icon="lock" value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <div style={styles.rules}>
          {RULES.map((r) => {
            const ok = r.test(pw);
            return (
              <span key={r.label} style={{ ...styles.rule, color: ok ? "var(--status-success-fg)" : "var(--text-subtle)" }}>
                <Icon name={ok ? "check" : "minus"} size={13} />
                {r.label}
              </span>
            );
          })}
        </div>
        <Checkbox
          checked={agreed}
          onChange={() => setAgreed((a) => !a)}
          label={<span style={{ fontSize: 13 }}>J'accepte les conditions d'utilisation et la politique de confidentialité.</span>}
        />
        <Button variant="primary" size="lg" fullWidth type="submit" disabled={!canSubmit}>
          Créer le compte
        </Button>
      </form>
    </AuthShell>
  );
}
