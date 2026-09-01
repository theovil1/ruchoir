"use client";

import { type CSSProperties, useRef, useState } from "react";
import { Avatar, Button, Card, Checkbox, Dialog, EmptyState, Field, Icon, IconButton, Input, Tabs, Tag } from "@/components/ds";
import type { SpaceFile } from "@/lib/data";
import type { Toast } from "../app/types";

const styles: Record<string, CSSProperties> = {
  root: { flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 },
  top: {
    height: "var(--topbar-height)",
    flex: "none",
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "0 12px 0 16px",
    borderBottom: "1px solid var(--border-subtle)",
  },
  crumb: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    margin: 0, // rendered as the page <h1> (breadcrumb heading)
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-strong)",
    letterSpacing: "var(--tracking-tight)",
  },
  body: { flex: 1, overflow: "auto", padding: "20px 24px" },
  bar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 14 },
  tableWrap: {
    border: "1px solid var(--border-subtle)",
    borderRadius: "var(--radius-md)",
    overflow: "hidden",
    background: "var(--surface-canvas)",
  },
  table: { width: "100%", borderCollapse: "collapse", tableLayout: "fixed" },
  th: {
    height: 34,
    textAlign: "left",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "var(--tracking-caps)",
    textTransform: "uppercase",
    color: "var(--text-subtle)",
    padding: "0 12px",
    background: "var(--grey-25)",
    borderBottom: "1px solid var(--border-subtle)",
    verticalAlign: "middle",
    whiteSpace: "nowrap",
  },
  td: {
    height: 44,
    padding: "0 12px",
    borderBottom: "1px solid var(--border-subtle)",
    fontSize: 13,
    color: "var(--text-body)",
    verticalAlign: "middle",
    overflow: "hidden",
  },
  checkCell: { display: "flex", alignItems: "center", justifyContent: "center" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(180px, 100%), 1fr))", gap: 12 },
};

/** Parse a French-formatted size ("248 Ko", "3,4 Mo") into bytes; unknown shapes yield 0. */
function sizeToBytes(size: string): number {
  const match = size.match(/([\d,]+)\s*(Ko|Mo|Go)/);
  if (!match) return 0;
  const value = Number(match[1].replace(",", "."));
  const unit = { Ko: 1e3, Mo: 1e6, Go: 1e9 }[match[2]] ?? 1;
  return value * unit;
}

/** Format a byte count back into a French-formatted size string. */
function bytesToSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1).replace(".", ",")} Go`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.max(1, Math.round(bytes / 1e3))} Ko`;
}

/** Shorten a file name from the middle so the extension stays visible (e.g. "Rapproche…mars.csv"). */
function truncateMiddle(name: string, max = 22): string {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : "";
  const base = ext ? name.slice(0, name.length - ext.length) : name;
  const keep = Math.max(4, max - ext.length - 1);
  return `${base.slice(0, keep)}…${ext}`;
}

/** Whether a file name looks like an image (drives the preview rendering). */
function isImage(name: string): boolean {
  return /\.(jpe?g|png|gif|webp|svg|heic)$/i.test(name);
}

/** Mock contents for folders, so opening one shows real files. Created folders are empty. */
const FOLDER_CONTENTS: Record<string, SpaceFile[]> = {
  Photos_chantier: [
    { name: "facade_avant.jpg", kind: "file", size: "2,4 Mo", by: "Yanis Berthier", when: "18 août", source: "Nextcloud", version: "v1" },
    { name: "charpente_pose.jpg", kind: "file", size: "3,1 Mo", by: "Adèle Fournier", when: "18 août", source: "Nextcloud", version: "v1" },
    { name: "plan_implantation.pdf", kind: "file", size: "640 Ko", by: "Camille Roussel", when: "17 août", source: "Nextcloud", version: "v2" },
    { name: "reception_materiaux.jpg", kind: "file", size: "1,8 Mo", by: "Marc Lévêque", when: "16 août", source: "Nextcloud", version: "v1" },
  ],
};

export type FilesScreenProps = {
  files: SpaceFile[];
  workspaceName: string;
  currentUser: string;
  onNewFolder: (name: string) => void;
  onUpload: (file: SpaceFile) => void;
  onNotify: (toast: Toast) => void;
  /** Compact (mobile) mode: force the card grid (the wide table cannot fit) and let the toolbar wrap. */
  compact?: boolean;
};

/** The space files view. Faithful to the design-system `screen-files` mockup, with working
 * filtering, selection, list/grid toggle, folder creation and file upload. */
export function FilesScreen({ files, workspaceName, currentUser, onNewFolder, onUpload, onNotify, compact = false }: FilesScreenProps) {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState("Tous");
  const [layout, setLayout] = useState<"list" | "grid">("list");
  // The 7-column table cannot fit a phone; force the responsive card grid on compact.
  const effectiveLayout = compact ? "grid" : layout;
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [currentFolder, setCurrentFolder] = useState<string | null>(null);
  const [preview, setPreview] = useState<SpaceFile | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const baseFiles = currentFolder ? FOLDER_CONTENTS[currentFolder] ?? [] : files;
  const rows = baseFiles
    .filter((f) => f.name.toLowerCase().includes(q.toLowerCase()))
    .filter((f) => tab === "Tous" || (tab === "Importés" ? f.source !== "Ruchoir" : f.kind === "folder"));

  const openFolder = (name: string) => {
    setCurrentFolder(name);
    setSelected(new Set());
    setQ("");
  };

  const totalBytes = rows.reduce((sum, f) => sum + sizeToBytes(f.size), 0);
  const allSelected = rows.length > 0 && rows.every((f) => selected.has(f.name));

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((f) => f.name)));

  const createFolder = () => {
    const name = folderName.trim();
    if (!name) return;
    onNewFolder(name);
    onNotify({ tone: "success", title: "Dossier créé", description: name });
    setFolderName("");
    setFolderOpen(false);
  };

  const onFilePicked = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    const kind: SpaceFile["kind"] = file.type.includes("spreadsheet")
      ? "file-spreadsheet"
      : file.type.startsWith("text")
        ? "file-text"
        : "file";
    onUpload({
      name: file.name,
      kind,
      size: bytesToSize(file.size),
      by: currentUser,
      when: "À l'instant",
      source: "Ruchoir",
      version: "v1",
    });
    onNotify({ tone: "success", title: "Fichier déposé", description: file.name });
    if (uploadRef.current) uploadRef.current.value = "";
  };

  return (
    <div style={styles.root}>
      <div
        style={
          compact
            ? { ...styles.top, height: "auto", minHeight: "var(--topbar-height)", flexWrap: "wrap", rowGap: 8, padding: "8px 12px" }
            : styles.top
        }
      >
        {/* Page heading: the file location, as a breadcrumb. */}
        <h1 style={styles.crumb}>
          <Icon name="hard-drive" size={15} style={{ color: "var(--text-muted)" }} />
          {currentFolder ? (
            <button
              type="button"
              onClick={() => setCurrentFolder(null)}
              style={{ border: 0, background: "none", padding: 0, cursor: "pointer", font: "inherit", color: "var(--text-muted)", fontWeight: 400 }}
            >
              {workspaceName}
            </button>
          ) : (
            <>
              Fichiers de l&apos;espace
              <Icon name="chevron-right" size={13} style={{ color: "var(--text-subtle)" }} />
              <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>{workspaceName}</span>
            </>
          )}
          {currentFolder ? (
            <>
              <Icon name="chevron-right" size={13} style={{ color: "var(--text-subtle)" }} />
              <span>{currentFolder}</span>
            </>
          ) : null}
        </h1>
        <div style={{ flex: compact ? "1 0 100%" : 1 }} />
        <Button size="sm" iconLeft="folder-plus" onClick={() => setFolderOpen(true)}>
          Nouveau dossier
        </Button>
        <Button size="sm" variant="primary" iconLeft="upload" onClick={() => uploadRef.current?.click()}>
          Déposer un fichier
        </Button>
        <input
          ref={uploadRef}
          type="file"
          style={{ display: "none" }}
          onChange={(e) => onFilePicked(e.target.files)}
        />
      </div>

      <div style={styles.body}>
        {currentFolder ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 14,
              padding: "10px 12px",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              background: "var(--surface-sunken)",
            }}
          >
            <Button size="sm" variant="secondary" iconLeft="arrow-left" onClick={() => setCurrentFolder(null)}>
              Retour
            </Button>
            <Icon name="folder" size={18} style={{ color: "var(--terracotta-500)" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-strong)" }}>{currentFolder}</span>
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>· {rows.length} élément{rows.length > 1 ? "s" : ""}</span>
          </div>
        ) : null}
        <div style={{ ...styles.bar, flexWrap: compact ? "wrap" : "nowrap" }}>
          <div style={{ width: compact ? "100%" : 280 }}>
            <Input size="sm" icon="search" placeholder="Filtrer les fichiers" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Tabs
            variant="pills"
            value={tab}
            onChange={setTab}
            items={[
              { value: "Tous", label: "Tous" },
              { value: "Dossiers", label: "Dossiers" },
              { value: "Importés", label: "Importés" },
            ]}
          />
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {rows.length} élément{rows.length > 1 ? "s" : ""}
            {totalBytes > 0 ? ` · ${bytesToSize(totalBytes)}` : ""}
          </span>
          {!compact ? (
            <>
              <IconButton
                icon="layout-grid"
                label="Vue en grille"
                size="sm"
                aria-pressed={layout === "grid"}
                onClick={() => setLayout("grid")}
              />
              <IconButton
                icon="list"
                label="Vue en liste"
                size="sm"
                aria-pressed={layout === "list"}
                onClick={() => setLayout("list")}
              />
            </>
          ) : null}
        </div>

        {effectiveLayout === "list" ? (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <colgroup>
                <col style={{ width: 44 }} />
                <col />
                <col style={{ width: 84 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 116 }} />
                <col style={{ width: 52 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={styles.th}>
                    <span style={styles.checkCell}>
                      <Checkbox checked={allSelected} onChange={toggleAll} aria-label="Tout sélectionner" />
                    </span>
                  </th>
                  <th style={styles.th}>Nom</th>
                  <th style={styles.th}>Version</th>
                  <th style={styles.th}>Modifié par</th>
                  <th style={styles.th}>Date</th>
                  <th style={styles.th}>Source</th>
                  <th style={styles.th} aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <FileRow
                    key={f.name}
                    f={f}
                    checked={selected.has(f.name)}
                    onToggle={() => toggle(f.name)}
                    onOpenFolder={() => openFolder(f.name)}
                    onOpenFile={() => setPreview(f)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={styles.grid}>
            {rows.map((f) => (
              <Card
                key={f.name}
                variant="interactive"
                padded
                onClick={() => (f.kind === "folder" ? openFolder(f.name) : setPreview(f))}
                style={{ display: "flex", flexDirection: "column", gap: 8, cursor: "pointer" }}
              >
                <Icon
                  name={f.kind}
                  size={26}
                  style={{ color: f.kind === "folder" ? "var(--terracotta-500)" : "var(--text-muted)" }}
                />
                <div
                  title={f.name}
                  style={{ fontSize: 13, fontWeight: 500, color: "var(--text-strong)", whiteSpace: "nowrap", overflow: "hidden" }}
                >
                  {truncateMiddle(f.name)}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--text-muted)" }}>
                  <Avatar name={f.by} size={18} />
                  {f.size}
                </div>
                {f.source !== "Ruchoir" ? <Tag icon="import">{f.source}</Tag> : null}
              </Card>
            ))}
          </div>
        )}

        {rows.length === 0 ? (
          <EmptyState
            icon={q ? "search" : currentFolder ? "folder-open" : "folder"}
            title={q ? "Aucun résultat" : currentFolder ? "Dossier vide" : "Aucun fichier"}
            description={
              q
                ? `Aucun fichier ne correspond à « ${q} ».`
                : currentFolder
                  ? "Ce dossier ne contient aucun fichier pour l'instant."
                  : "Déposez vos premiers fichiers, ou reprenez-les depuis Slack, Mattermost ou Nextcloud lors d'un import."
            }
            action={
              !q ? (
                <Button size="sm" variant="primary" iconLeft="upload" onClick={() => uploadRef.current?.click()}>
                  Déposer un fichier
                </Button>
              ) : undefined
            }
          />
        ) : null}
        {rows.length > 0 ? (
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 12 }}>
            La colonne « Source » indique l&apos;outil d&apos;origine des fichiers repris lors d&apos;un import (Slack, Mattermost,
            Nextcloud). Les fichiers créés dans Ruchoir n&apos;affichent pas de badge.
          </p>
        ) : null}
      </div>

      <Dialog
        open={folderOpen}
        title="Nouveau dossier"
        size="sm"
        onClose={() => setFolderOpen(false)}
        footer={
          <>
            <Button onClick={() => setFolderOpen(false)}>Annuler</Button>
            <Button variant="primary" onClick={createFolder}>
              Créer
            </Button>
          </>
        }
      >
        <Field label="Nom du dossier" htmlFor="fname">
          <Input
            id="fname"
            autoFocus
            placeholder="ex. Factures 2026"
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createFolder();
            }}
          />
        </Field>
      </Dialog>

      <Dialog
        open={preview != null}
        title={preview?.name}
        subtitle={preview ? `${preview.size} · modifié par ${preview.by} · ${preview.when}` : undefined}
        size="lg"
        onClose={() => setPreview(null)}
        footer={
          preview ? (
            <>
              {preview.source !== "Ruchoir" ? <Tag icon="import">Importé de {preview.source}</Tag> : null}
              {preview.version ? (
                <Tag mono tone="info">
                  {preview.version}
                </Tag>
              ) : null}
              <div style={{ flex: 1 }} />
              <Button onClick={() => setPreview(null)}>Fermer</Button>
              <Button
                variant="primary"
                iconLeft="download"
                onClick={() => onNotify({ tone: "success", title: "Téléchargement démarré", description: preview.name })}
              >
                Télécharger
              </Button>
            </>
          ) : null
        }
      >
        {preview ? (
          <div
            style={{
              height: 320,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border-subtle)",
              background: isImage(preview.name)
                ? "linear-gradient(135deg, var(--grey-100), var(--surface-sunken))"
                : "var(--surface-sunken)",
            }}
          >
            <Icon
              name={isImage(preview.name) ? "image" : preview.kind === "folder" ? "folder" : preview.kind}
              size={52}
              style={{ color: "var(--text-subtle)" }}
            />
            <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
              {isImage(preview.name) ? "Aperçu de l'image" : "Aperçu du document"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>Ouvert dans Ruchoir, sans téléchargement.</div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function FileRow({
  f,
  checked,
  onToggle,
  onOpenFolder,
  onOpenFile,
}: {
  f: SpaceFile;
  checked: boolean;
  onToggle: () => void;
  onOpenFolder: () => void;
  onOpenFile: () => void;
}) {
  const [hover, setHover] = useState(false);
  const isFolder = f.kind === "folder";
  const open = isFolder ? onOpenFolder : onOpenFile;
  return (
    <tr
      style={{ background: hover || checked ? "var(--surface-hover)" : "transparent" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <td style={styles.td}>
        <span style={styles.checkCell}>
          <Checkbox checked={checked} onChange={onToggle} aria-label={`Sélectionner ${f.name}`} />
        </span>
      </td>
      <td style={styles.td}>
        <span
          role="button"
          tabIndex={0}
          onClick={open}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && open()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            minWidth: 0,
            cursor: "pointer",
          }}
        >
          <Icon
            name={f.kind}
            size={17}
            style={{ flex: "none", color: isFolder ? "var(--terracotta-500)" : "var(--text-muted)" }}
          />
          <span
            style={{
              fontWeight: 500,
              color: "var(--text-strong)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {f.name}
          </span>
        </span>
      </td>
      <td style={styles.td}>{f.version ? <Tag mono tone="info">{f.version}</Tag> : null}</td>
      <td style={styles.td}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
          <Avatar name={f.by} size={20} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.by.split(" ")[0]}</span>
        </span>
      </td>
      <td style={{ ...styles.td, color: "var(--text-muted)", fontSize: 12 }}>{f.when}</td>
      <td style={styles.td}>
        {f.source === "Ruchoir" ? (
          <span style={{ fontSize: 12, color: "var(--text-subtle)" }}>-</span>
        ) : (
          <Tag icon="import">{f.source}</Tag>
        )}
      </td>
      <td style={styles.td}>
        <span style={{ ...styles.checkCell, opacity: hover ? 1 : 0, transition: "opacity var(--duration-fast) var(--ease-out)" }}>
          <IconButton
            icon={isFolder ? "folder-open" : "eye"}
            label={isFolder ? `Ouvrir ${f.name}` : `Aperçu de ${f.name}`}
            size="sm"
            tabIndex={hover ? 0 : -1}
            onClick={open}
          />
        </span>
      </td>
    </tr>
  );
}
