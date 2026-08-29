import { Button, Icon } from "@/components/ds";

export type EmptyViewProps = {
  icon: string;
  title: string;
  text: string;
};

/** Placeholder for views the kit intentionally leaves undefined (Threads, Mentions, Saved). */
export function EmptyView({ icon, title, text }: EmptyViewProps) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: 40,
      }}
    >
      <Icon name={icon} size={26} style={{ color: "var(--grey-300)" }} />
      <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text-strong)" }}>{title}</div>
      <p style={{ fontSize: 13, color: "var(--text-muted)", maxWidth: 340, textAlign: "center" }}>
        {text}
      </p>
      <Button size="sm" iconLeft="refresh-cw" style={{ marginTop: 4 }}>
        Actualiser
      </Button>
    </div>
  );
}
