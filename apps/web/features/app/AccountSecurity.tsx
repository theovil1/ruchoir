"use client";

import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { Button, Dialog, Field, Icon, IconButton, Input, Tag } from "@/components/ds";
import {
  generateRecoveryCodes,
  groupSecret,
  MOCK_TOTP_SECRET,
  otpauthUri,
  qrMatrix,
  type Passkey,
} from "./security";
import { useSettings } from "./settings";
import type { Toast } from "./types";

/** The signed-in user, used to label the otpauth account. Fixed in this mock exploration. */
const ACCOUNT_EMAIL = "theo@atelier-nantes.fr";

const row: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  flexWrap: "wrap",
  gap: 12,
  rowGap: 8,
  padding: "12px 0",
  borderBottom: "1px solid var(--border-subtle)",
};

function Row({ title, desc, children }: { title: ReactNode; desc?: ReactNode; children: ReactNode }) {
  return (
    <div style={row}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)" }}>{title}</div>
        {desc ? <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2, maxWidth: 460 }}>{desc}</div> : null}
      </div>
      {children}
    </div>
  );
}

/** Copy `text` to the clipboard, then flash a short "copied" acknowledgement through `onDone`. */
async function copy(text: string, onDone: () => void) {
  try {
    await navigator.clipboard.writeText(text);
    onDone();
  } catch {
    // Clipboard access can be denied; silently ignore in this exploration.
  }
}

/**
 * Representative QR render (see `qrMatrix`): dark modules on white so it stays scannable-looking in
 * every theme. Not a real encoded QR, but visually faithful for the setup flow.
 */
function QrCode({ value, size = 176 }: { value: string; size?: number }) {
  const grid = useMemo(() => qrMatrix(value, 25), [value]);
  const n = grid.length;
  const cell = size / n;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="QR code de configuration à scanner dans votre application d'authentification"
      style={{ display: "block", borderRadius: 8 }}
    >
      <rect width={size} height={size} fill="#ffffff" />
      {grid.flatMap((line, r) =>
        line.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={c * cell} y={r * cell} width={cell} height={cell} fill="#171716" /> : null,
        ),
      )}
    </svg>
  );
}

/** Change-password dialog. Mock: any inputs succeed once the new password is confirmed. */
function ChangePasswordDialog({ onClose, onNotify }: { onClose: () => void; onNotify?: (t: Toast) => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const mismatch = confirm.length > 0 && next !== confirm;
  const canSave = current.length > 0 && next.length >= 8 && next === confirm;

  const save = () => {
    if (!canSave) return;
    onNotify?.({ tone: "success", title: "Mot de passe modifié" });
    onClose();
  };

  return (
    <Dialog
      title="Modifier le mot de passe"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={save} disabled={!canSave}>
            Enregistrer
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Mot de passe actuel" htmlFor="pw-current">
          <Input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
        </Field>
        <Field label="Nouveau mot de passe" htmlFor="pw-new" hint="12 caractères ou plus recommandés.">
          <Input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
        </Field>
        <Field label="Confirmer le nouveau mot de passe" htmlFor="pw-confirm" error={mismatch ? "Les mots de passe ne correspondent pas." : undefined}>
          <Input id="pw-confirm" type="password" autoComplete="new-password" invalid={mismatch} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Panel that lists the recovery codes with copy, download and print-friendly layout. */
function RecoveryCodesList({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const asText = codes.join("\n");

  const download = () => {
    const blob = new Blob([`${asText}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ruchoir-codes-de-recuperation.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6px 16px",
          padding: 14,
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          background: "var(--surface-sunken)",
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: "var(--text-strong)",
        }}
      >
        {codes.map((code) => (
          <span key={code}>{code}</span>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <Button size="sm" iconLeft={copied ? "check" : "copy"} onClick={() => copy(asText, () => { setCopied(true); setTimeout(() => setCopied(false), 1600); })}>
          {copied ? "Copié" : "Copier"}
        </Button>
        <Button size="sm" iconLeft="download" onClick={download}>
          Télécharger
        </Button>
      </div>
    </div>
  );
}

/**
 * Two-step TOTP enrolment wizard: scan the QR (or copy the secret) and confirm a 6-digit code, then
 * save the generated recovery codes. Mock: any 6-digit code is accepted.
 */
function TotpSetupDialog({
  seed,
  onClose,
  onEnabled,
  onNotify,
}: {
  seed: number;
  onClose: () => void;
  onEnabled: () => void;
  onNotify?: (t: Toast) => void;
}) {
  const [step, setStep] = useState<"scan" | "codes">("scan");
  const [code, setCode] = useState("");
  const [secretCopied, setSecretCopied] = useState(false);
  const uri = useMemo(() => otpauthUri(MOCK_TOTP_SECRET, ACCOUNT_EMAIL), []);
  const codes = useMemo(() => generateRecoveryCodes(seed), [seed]);
  const codeValid = /^\d{6}$/.test(code);

  const verify = () => {
    if (!codeValid) return;
    setStep("codes");
  };
  const finish = () => {
    onEnabled();
    onNotify?.({ tone: "success", title: "Authentification à deux facteurs activée" });
    onClose();
  };

  return (
    <Dialog
      title="Configurer l'authentification à deux facteurs"
      subtitle={step === "scan" ? "Étape 1 sur 2 : application d'authentification" : "Étape 2 sur 2 : codes de récupération"}
      size="md"
      onClose={onClose}
      footer={
        step === "scan" ? (
          <>
            <Button onClick={onClose}>Annuler</Button>
            <Button variant="primary" onClick={verify} disabled={!codeValid}>
              Vérifier et continuer
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={finish}>
            J&apos;ai enregistré mes codes
          </Button>
        )
      }
    >
      {step === "scan" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <p style={{ fontSize: 13, color: "var(--text-body)", margin: 0 }}>
            Scannez ce QR code avec une application comme Aegis, FreeOTP ou Google Authenticator, puis saisissez le
            code à 6 chiffres qu&apos;elle affiche.
          </p>
          <div style={{ display: "flex", gap: 18, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ padding: 8, background: "#ffffff", borderRadius: 10, border: "1px solid var(--border-subtle)", flex: "none" }}>
              <QrCode value={uri} />
            </div>
            <div style={{ flex: 1, minWidth: 200, display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 4 }}>Ou saisissez la clé manuellement</div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <code
                    style={{
                      flex: 1,
                      fontFamily: "var(--font-mono)",
                      fontSize: 13,
                      letterSpacing: "0.04em",
                      color: "var(--text-strong)",
                      background: "var(--surface-sunken)",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-sm)",
                      padding: "6px 8px",
                      wordBreak: "break-all",
                    }}
                  >
                    {groupSecret(MOCK_TOTP_SECRET)}
                  </code>
                  <IconButton
                    icon={secretCopied ? "check" : "copy"}
                    label={secretCopied ? "Clé copiée" : "Copier la clé"}
                    size="sm"
                    onClick={() => copy(MOCK_TOTP_SECRET, () => { setSecretCopied(true); setTimeout(() => setSecretCopied(false), 1600); })}
                  />
                </div>
              </div>
              <Field label="Code de vérification" htmlFor="totp-code" hint="6 chiffres affichés par l'application.">
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </Field>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            style={{
              display: "flex",
              gap: 10,
              padding: 12,
              borderRadius: "var(--radius-md)",
              background: "var(--status-warning-bg)",
              border: "1px solid var(--status-warning-border)",
              color: "var(--status-warning-fg)",
            }}
          >
            <Icon name="key-round" size={16} />
            <span style={{ fontSize: 13 }}>
              Conservez ces codes en lieu sûr. Chacun débloque votre compte une fois si vous perdez l&apos;accès à votre
              application d&apos;authentification.
            </span>
          </div>
          <RecoveryCodesList codes={codes} />
        </div>
      )}
    </Dialog>
  );
}

/** Confirm turning two-factor off. */
function DisableTotpDialog({ onClose, onConfirm }: { onClose: () => void; onConfirm: () => void }) {
  return (
    <Dialog
      title="Désactiver l'authentification à deux facteurs ?"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="danger" onClick={onConfirm}>
            Désactiver
          </Button>
        </>
      }
    >
      <p style={{ fontSize: 13, color: "var(--text-body)" }}>
        Votre compte ne sera plus protégé que par votre mot de passe. Vos codes de récupération seront invalidés.
      </p>
    </Dialog>
  );
}

/** Register a new passkey (mock: names a fake credential). */
function AddPasskeyDialog({ onClose, onAdd }: { onClose: () => void; onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  const add = () => {
    const clean = name.trim() || "Nouvelle clé";
    onAdd(clean);
    onClose();
  };
  return (
    <Dialog
      title="Ajouter une clé d'accès"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Annuler</Button>
          <Button variant="primary" iconLeft="fingerprint" onClick={add}>
            Créer la clé
          </Button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p style={{ fontSize: 13, color: "var(--text-body)", margin: 0 }}>
          Votre appareil vous demandera votre empreinte, votre visage ou votre code. Donnez un nom à cette clé pour la
          reconnaître plus tard.
        </p>
        <Field label="Nom de la clé" htmlFor="pk-name">
          <Input id="pk-name" autoFocus placeholder="MacBook (Touch ID)" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

/** Regenerate + display recovery codes for an already-enrolled account. */
function RecoveryCodesDialog({ codes, onClose, onRegenerate }: { codes: string[]; onClose: () => void; onRegenerate: () => void }) {
  return (
    <Dialog
      title="Codes de récupération"
      subtitle="Utilisables une seule fois, en cas de perte de votre application."
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button iconLeft="refresh-cw" onClick={onRegenerate}>
            Régénérer
          </Button>
          <Button variant="primary" onClick={onClose}>
            Fermer
          </Button>
        </>
      }
    >
      <RecoveryCodesList codes={codes} />
    </Dialog>
  );
}

type OpenDialog = "password" | "totp" | "disable" | "passkey" | "recovery" | null;

/** The "Compte et sécurité" section rendered inside the personal preferences dialog. */
export function AccountSecuritySection({ onNotify }: { onNotify?: (t: Toast) => void }) {
  const s = useSettings();
  const sec = s.security;
  const [open, setOpen] = useState<OpenDialog>(null);
  const close = () => setOpen(null);

  const recoveryCodes = useMemo(() => generateRecoveryCodes(sec.recoverySeed), [sec.recoverySeed]);

  const enableTotp = () => s.set("security", { ...sec, totpEnabled: true, recoveryRemaining: 10 });
  const disableTotp = () => {
    s.set("security", { ...sec, totpEnabled: false });
    onNotify?.({ tone: "info", title: "Authentification à deux facteurs désactivée" });
    close();
  };
  const regenerate = () => {
    s.set("security", { ...sec, recoverySeed: sec.recoverySeed + 1, recoveryRemaining: 10 });
    onNotify?.({ tone: "success", title: "Nouveaux codes de récupération générés" });
  };
  const addPasskey = (name: string) => {
    const passkey: Passkey = { id: `pk-${sec.passkeys.length + 1}-${name.length}`, name, added: "aujourd'hui" };
    s.set("security", { ...sec, passkeys: [...sec.passkeys, passkey] });
    onNotify?.({ tone: "success", title: "Clé d'accès ajoutée", description: name });
  };
  const removePasskey = (id: string) => {
    s.set("security", { ...sec, passkeys: sec.passkeys.filter((p) => p.id !== id) });
  };

  return (
    <>
      <Row title="Mot de passe" desc="Dernière modification il y a 3 mois.">
        <Button size="sm" onClick={() => setOpen("password")}>
          Modifier
        </Button>
      </Row>

      <Row
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Authentification à deux facteurs
            {sec.totpEnabled ? <Tag tone="success" icon="shield-check">Activée</Tag> : <Tag tone="neutral">Désactivée</Tag>}
          </span>
        }
        desc={sec.totpEnabled ? "Application d'authentification (TOTP) configurée." : "Ajoutez un code à usage unique en plus de votre mot de passe."}
      >
        {sec.totpEnabled ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen("disable")}>
            Désactiver
          </Button>
        ) : (
          <Button size="sm" variant="primary" onClick={() => setOpen("totp")}>
            Configurer
          </Button>
        )}
      </Row>

      {sec.totpEnabled ? (
        <Row title="Codes de récupération" desc={`${sec.recoveryRemaining} code${sec.recoveryRemaining > 1 ? "s" : ""} restant${sec.recoveryRemaining > 1 ? "s" : ""}.`}>
          <Button size="sm" onClick={() => setOpen("recovery")}>
            Afficher
          </Button>
        </Row>
      ) : null}

      <Row
        title={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            Clés d&apos;accès (passkeys)
            <Tag tone="info">{sec.passkeys.length}</Tag>
          </span>
        }
        desc="Connexion sans mot de passe par empreinte, visage ou code de l'appareil."
      >
        <Button size="sm" iconLeft="plus" onClick={() => setOpen("passkey")}>
          Ajouter
        </Button>
      </Row>

      {sec.passkeys.length > 0 ? (
        <div style={{ padding: "12px 0 4px", display: "flex", flexDirection: "column", gap: 6 }}>
          {sec.passkeys.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-md)",
                background: "var(--surface-sunken)",
              }}
            >
              <Icon name="fingerprint" size={16} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, color: "var(--text-strong)" }}>{p.name}</span>
                <span style={{ display: "block", fontSize: 11, color: "var(--text-muted)" }}>Ajoutée le {p.added}</span>
              </span>
              <IconButton icon="trash-2" label={`Supprimer la clé ${p.name}`} size="sm" onClick={() => removePasskey(p.id)} />
            </div>
          ))}
        </div>
      ) : null}

      {open === "password" ? <ChangePasswordDialog onClose={close} onNotify={onNotify} /> : null}
      {open === "totp" ? <TotpSetupDialog seed={sec.recoverySeed} onClose={close} onEnabled={enableTotp} onNotify={onNotify} /> : null}
      {open === "disable" ? <DisableTotpDialog onClose={close} onConfirm={disableTotp} /> : null}
      {open === "passkey" ? <AddPasskeyDialog onClose={close} onAdd={addPasskey} /> : null}
      {open === "recovery" ? <RecoveryCodesDialog codes={recoveryCodes} onClose={close} onRegenerate={regenerate} /> : null}
    </>
  );
}
