"use client";

import { type CSSProperties, useState } from "react";
import { Button, Card, Checkbox, Dialog, Field, Icon, Input, Radio, Select, Tag } from "@/components/ds";

type Source = "slack" | "mattermost" | "nextcloud";

const LABELS: Record<Source, string> = { slack: "Slack", mattermost: "Mattermost", nextcloud: "Nextcloud" };

const SOURCES: [Source, string, string][] = [
  ["slack", "Slack", "Export JSON d'espace de travail (.zip)"],
  ["mattermost", "Mattermost", "Archive d'équipe (.jsonl)"],
  ["nextcloud", "Nextcloud", "Connexion WebDAV ou dossier monté"],
];

const STATS: [string, string][] = [
  ["6", "canaux"],
  ["8 912", "messages"],
  ["143", "fichiers"],
  ["14", "comptes"],
];

const styles: Record<string, CSSProperties> = {
  callout: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    border: "1px solid var(--status-info-border)",
    background: "var(--status-info-bg)",
    borderRadius: "var(--radius-md)",
  },
};

export type ImportDialogProps = {
  onClose: () => void;
  /** Called when the import is launched, with the chosen source label (e.g. "Slack"). */
  onDone: (source: string) => void;
};

/** The import wizard. Faithful to the design-system `screen-import` mockup: source, content, summary. */
export function ImportDialog({ onClose, onDone }: ImportDialogProps) {
  const [step, setStep] = useState(1);
  const [src, setSrc] = useState<Source>("slack");

  return (
    <Dialog
      size="lg"
      onClose={onClose}
      title="Importer depuis un autre outil"
      subtitle={`Étape ${step} sur 3 · espace Atelier Nantes`}
      footer={
        <>
          {step > 1 ? (
            <Button onClick={() => setStep(step - 1)} iconLeft="arrow-left">
              Retour
            </Button>
          ) : (
            <Button onClick={onClose}>Annuler</Button>
          )}
          {step < 3 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              Continuer
            </Button>
          ) : (
            <Button variant="primary" iconLeft="play" onClick={() => onDone(LABELS[src])}>
              Lancer l&apos;import
            </Button>
          )}
        </>
      }
    >
      {step === 1 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4 }}>
            Choisissez la source. L&apos;export de l&apos;outil d&apos;origine est nécessaire.
          </p>
          {SOURCES.map(([v, n, d]) => (
            <label
              key={v}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 12,
                border: `1px solid ${src === v ? "var(--border-accent)" : "var(--border-default)"}`,
                background: src === v ? "var(--surface-selected)" : "var(--surface-canvas)",
                borderRadius: "var(--radius-md)",
                cursor: "pointer",
              }}
            >
              <Radio name="src" checked={src === v} onChange={() => setSrc(v)} />
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-strong)" }}>{n}</span>
                <span style={{ display: "block", fontSize: 12, color: "var(--text-muted)" }}>{d}</span>
              </span>
            </label>
          ))}
        </div>
      ) : null}

      {step === 2 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label={`Fichier d'export ${LABELS[src]}`} hint="Jusqu'à 20 Go par archive" htmlFor="fl">
            <div style={{ display: "flex", gap: 8 }}>
              <Input id="fl" style={{ flex: 1 }} defaultValue="atelier-slack-export-2026-01.zip" icon="file-archive" />
              <Button iconLeft="folder-open">Parcourir</Button>
            </div>
          </Field>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--text-body)", marginBottom: 8 }}>Contenu à reprendre</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Checkbox defaultChecked label="Canaux publics" description="6 canaux détectés" />
              <Checkbox defaultChecked label="Canaux privés" description="Vous devez en être membre dans la source" />
              <Checkbox defaultChecked label="Historique des messages" description="Jusqu'à 10 000 messages par canal" />
              <Checkbox label="Messages directs" description="Nécessite l'accord des personnes concernées" />
              <Checkbox defaultChecked label="Fichiers joints" description="4,7 Go estimés" />
            </div>
          </div>
          <Field label="Correspondance des comptes" hint="Les comptes non appariés seront créés en invités." htmlFor="mp">
            <Select id="mp" options={["Par adresse électronique", "Par nom affiché", "Manuelle"]} />
          </Field>
        </div>
      ) : null}

      {step === 3 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Card variant="sunken" padded>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
              {STATS.map(([n, l]) => (
                <div key={l}>
                  <div
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: "var(--text-strong)",
                      letterSpacing: "var(--tracking-tight)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {n}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{l}</div>
                </div>
              ))}
            </div>
          </Card>
          <div style={styles.callout}>
            <Icon name="info" size={16} style={{ color: "var(--status-info-fg)", marginTop: 1 }} />
            <p style={{ fontSize: 12, color: "var(--status-info-fg)", lineHeight: 1.5 }}>
              L&apos;import se poursuit en arrière-plan. Les canaux apparaissent au fur et à mesure et portent l&apos;étiquette
              « Importé de {LABELS[src]} » pendant sept jours.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Tag icon="check" tone="success">
              Archive lue
            </Tag>
            <Tag icon="check" tone="success">
              Comptes appariés
            </Tag>
            <Tag icon="clock">Fichiers en attente</Tag>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}
