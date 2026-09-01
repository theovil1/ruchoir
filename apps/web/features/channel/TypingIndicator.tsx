/**
 * "Someone is typing" indicator. Ephemeral: the realtime layer delivers this over the channel and
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
        width: "100%",
        margin: "0 auto",
        padding: "4px 24px 8px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        minHeight: 20,
        fontSize: 12,
        fontStyle: "italic",
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
