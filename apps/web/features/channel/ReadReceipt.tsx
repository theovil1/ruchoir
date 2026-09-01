import { Icon } from "@/components/ds";

/**
 * Discreet "read" indicator, shown on hover only (see MessageRow). This exploration renders a
 * per-message receipt to visualize it; whether the schema stores that (heavy, privacy-sensitive)
 * or a single per-channel read cursor (light) is an open data-model decision, logged in the reframing log.
 */
export function ReadReceipt({ names }: { names?: string[] }) {
  const label =
    !names || names.length === 0
      ? "Lu"
      : names.length <= 2
        ? `Lu par ${names.join(", ")}`
        : `Lu par ${names.length} personnes`;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        color: "var(--text-subtle)",
      }}
    >
      <Icon name="check-check" size={12} />
      {label}
    </span>
  );
}
