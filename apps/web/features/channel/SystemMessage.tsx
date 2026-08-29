import { Icon } from "@/components/ds";
import type { Message } from "@/lib/data";

/** Centered notice for join/leave and similar system events. */
export function SystemMessage({ m }: { m: Message }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        margin: "10px 0",
        fontSize: 12,
        color: "var(--text-subtle)",
      }}
    >
      {m.systemIcon ? <Icon name={m.systemIcon} size={13} /> : null}
      <span>{m.body}</span>
      <span style={{ fontVariantNumeric: "tabular-nums" }}>{m.time}</span>
    </div>
  );
}
