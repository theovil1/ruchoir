/**
 * Development-only initial-state deep linking.
 *
 * The app is a state machine (auth stage + active view + optional modal), not a set of
 * routes, so there is no URL to jump straight to a given screen. This helper lets tooling
 * (see `tools/responsive-audit`) and manual testing land directly on any UI state through
 * query parameters, for example:
 *
 *   /?stage=login
 *   /?stage=app&view=files
 *   /?stage=app&modal=import
 *   /?stage=app&view=channel&channel=compta&panel=members
 *
 * It is strictly a dev affordance: the static production export is built with
 * `NODE_ENV=production`, where `readDeepLink()` returns `null` and reads nothing. Values are
 * validated against fixed allowlists so an unknown parameter is ignored rather than trusted.
 */

const STAGES = ["login", "signup", "onboarding", "app"] as const;
const VIEWS = ["channel", "files", "settings", "threads", "mentions", "saved"] as const;
const PANELS = ["files", "members", "pinned", "search"] as const;
const MODALS = [
  "prefs",
  "import",
  "newChannel",
  "newMessage",
  "invite",
  "newWorkspace",
  "help",
  "search",
] as const;

export type DeepLink = {
  stage?: (typeof STAGES)[number];
  view?: (typeof VIEWS)[number];
  channel?: string;
  panel?: (typeof PANELS)[number];
  modal?: (typeof MODALS)[number];
  /** Compact shell only: push the content view full-screen (instead of showing the list). */
  push?: boolean;
};

/**
 * Parse the current location's query string into a validated {@link DeepLink}, or `null`
 * when disabled (production build) or when no recognised parameter is present.
 */
export function readDeepLink(): DeepLink | null {
  if (process.env.NODE_ENV === "production") return null;
  if (typeof window === "undefined") return null;

  const q = new URLSearchParams(window.location.search);
  const pick = <T extends readonly string[]>(key: string, allow: T): T[number] | undefined => {
    const v = q.get(key);
    return v && (allow as readonly string[]).includes(v) ? (v as T[number]) : undefined;
  };

  const link: DeepLink = {
    stage: pick("stage", STAGES),
    view: pick("view", VIEWS),
    channel: q.get("channel") || undefined,
    panel: pick("panel", PANELS),
    modal: pick("modal", MODALS),
    push: q.get("push") === "1" || q.get("push") === "true" ? true : undefined,
  };

  return Object.values(link).some((v) => v !== undefined) ? link : null;
}
