import { Icon } from "@/components/ds";
import type { LinkPreview } from "@/lib/data";

/**
 * Link unfurl card. In this exploration the thumbnail is a placeholder: real unfurls are
 * fetched and stored server-side (see LinkPreview in lib/data/types), never in the browser.
 */
export function LinkPreviewCard({ link }: { link: LinkPreview }) {
  return (
    <a
      href={link.url}
      onClick={(e) => e.preventDefault()}
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        maxWidth: 460,
        marginTop: 8,
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        background: "var(--surface-card)",
        textDecoration: "none",
        cursor: "pointer",
      }}
    >
      <span
        aria-hidden
        style={{ width: 4, flex: "none", background: "var(--border-strong)" }}
      />
      <span style={{ flex: 1, minWidth: 0, padding: "10px 12px" }}>
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
          }}
        >
          <Icon name="globe" size={12} />
          {link.domain}
        </span>
        <span
          style={{
            display: "block",
            marginTop: 3,
            fontSize: 14,
            fontWeight: 600,
            color: "var(--text-strong)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {link.title}
        </span>
        {link.description ? (
          <span
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              marginTop: 3,
              fontSize: 13,
              lineHeight: "var(--leading-snug)",
              color: "var(--text-muted)",
            }}
          >
            {link.description}
          </span>
        ) : null}
      </span>
      {link.hasImage ? (
        <span
          aria-hidden
          style={{
            width: 96,
            flex: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--surface-sunken)",
            borderLeft: "1px solid var(--border-subtle)",
            color: "var(--grey-300)",
          }}
        >
          <Icon name="image" size={22} />
        </span>
      ) : null}
    </a>
  );
}
