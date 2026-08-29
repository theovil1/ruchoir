/**
 * "Someone is typing" indicator. Ephemeral: L3 delivers this over the realtime channel and
 * never stores it. Rendered just above the composer.
 */
export function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null;
  const label =
    names.length === 1
      ? `${names[0]} est en train d'écrire`
      : `${names.slice(0, 2).join(", ")}${names.length > 2 ? " et d'autres" : ""} sont en train d'écrire`;
  return (
    <div
      aria-live="polite"
      style={{
        maxWidth: "var(--channel-measure)",
        margin: "0 auto",
        padding: "0 24px 2px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 18,
        fontSize: 12,
        color: "var(--text-subtle)",
      }}
    >
      <span className="wc-typing" aria-hidden>
        <span />
        <span />
        <span />
      </span>
      {label}
    </div>
  );
}
