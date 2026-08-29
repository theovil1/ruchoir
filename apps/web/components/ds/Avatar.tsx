import type { CSSProperties } from "react";
import { type AvatarKind, avatarDataUri } from "@/lib/avatar";

export type Presence = "online" | "away" | "busy" | "offline";

export type AvatarProps = {
  name?: string;
  src?: string;
  size?: number;
  shape?: "square" | "round";
  presence?: Presence;
  /** Which DiceBear style to use for the default avatar (person/bot/workspace). */
  kind?: AvatarKind;
  className?: string;
  style?: CSSProperties;
};

/** Square avatar. Default image is generated locally with DiceBear, seeded by name. */
export function Avatar({
  name = "",
  src,
  size = 28,
  shape = "square",
  presence,
  kind = "person",
  className = "",
  style,
}: AvatarProps) {
  const imgSrc = src ?? avatarDataUri(name, kind);
  const dot = size >= 36 ? 9 : size >= 24 ? 7 : size >= 18 ? 5 : 4;
  return (
    <span className={`wc-av-wrap ${className}`} style={{ width: size, height: size, ...style }}>
      <span
        className={`wc-av${shape === "round" ? " wc-av--round" : ""}`}
        style={{ width: size, height: size }}
      >
        <img src={imgSrc} alt={name} />
      </span>
      {presence ? (
        <span
          className="wc-av__dot"
          style={{ width: dot, height: dot, background: `var(--presence-${presence})` }}
        />
      ) : null}
    </span>
  );
}
