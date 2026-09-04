/**
 * The data seam.
 *
 * Screens read every piece of domain data through this module and never import
 * `lib/mock` directly. Today each function returns fixture data synchronously; once wired
 * these bodies become `fetch` calls to the Rust API. Keeping the signatures stable here
 * is what lets that swap happen without editing a single view.
 */
import {
  CHANNELS,
  CURRENT_USER,
  DMS,
  FILES,
  MESSAGES,
  PROFILES,
  WORKSPACES,
} from "@/lib/mock/fixtures";
import type { Presence } from "@/components/ds";
import type {
  Channel,
  DirectMessage,
  Message,
  Profile,
  SpaceFile,
  Workspace,
} from "./types";

export function getWorkspaces(): Workspace[] {
  return WORKSPACES;
}

export function getWorkspace(id: string): Workspace | undefined {
  return WORKSPACES.find((w) => w.id === id);
}

export function getChannels(): Channel[] {
  return CHANNELS;
}

export function getChannel(id: string): Channel | undefined {
  return CHANNELS.find((c) => c.id === id);
}

export function getDirectMessages(): DirectMessage[] {
  return DMS;
}

/** Messages seeding a channel's feed. Channels without history return an empty list. */
export function getChannelMessages(channelId: string): Message[] {
  return MESSAGES[channelId] ?? [];
}

export function getSpaceFiles(): SpaceFile[] {
  return FILES;
}

export function getCurrentUser(): { name: string } {
  return CURRENT_USER;
}

/**
 * Names currently typing in a channel. Ephemeral by nature: the realtime layer delivers this over the
 * channel and never persists it. Mocked here so the indicator can be visualized.
 */
export function getTypingUsers(channelId: string): string[] {
  return channelId === "compta" ? ["Yanis Berthier"] : [];
}

/**
 * Runtime overrides so a user can change their own presence and custom status and have it reflected
 * everywhere (feed, member list, profile). In the real app this comes from the API; here it is an
 * in-memory override read by the getters below. Components re-render via app state, then read these.
 */
const presenceOverride: Record<string, Presence> = {};

export function setUserPresence(name: string, presence: Presence): void {
  presenceOverride[name] = presence;
}

/** A user's profile, by display name. Falls back to a minimal profile for unknown names. */
export function getProfile(name: string): Profile {
  const base =
    PROFILES[name] ??
    ({ name, role: "Membre", presence: "offline", email: "", timezone: "Europe/Paris", localTime: "10:32" } as Profile);
  return { ...base, presence: getPresence(name) };
}

/** A user's presence, by display name (honouring runtime overrides). */
export function getPresence(name: string): Presence {
  return presenceOverride[name] ?? PROFILES[name]?.presence ?? "offline";
}

/** Extra members beyond the direct-message participants, matching the kit's member list. */
const EXTRA_MEMBERS = [
  { name: "Marc Lévêque", presence: "offline" as Presence },
  { name: "Sofia Nadir", presence: "online" as Presence },
];

type MemberRecord = { name: string; presence: Presence; bot?: boolean };

/**
 * Live member roster, populated by the app once the real space members are loaded. Kept here (not
 * threaded through props) because the member list, the `@`-mention autocomplete and the people search
 * all read it synchronously through this seam. Null until loaded, when the mock roster is used.
 */
let liveMembers: MemberRecord[] | null = null;

/** Replace the member roster with the real space members (call with an empty list to clear). */
export function setChannelMembers(members: MemberRecord[]): void {
  liveMembers = members;
}

/** Channel members (for the member list and mention autocomplete). */
export function getChannelMembers(): MemberRecord[] {
  if (liveMembers) return liveMembers;
  return [...DMS.map((d) => ({ name: d.name, presence: d.presence, bot: d.bot })), ...EXTRA_MEMBERS];
}

/** Names that can be @mentioned in the current channel. */
export function getMentionNames(): string[] {
  return getChannelMembers().map((m) => m.name);
}

export type {
  Channel,
  ChannelType,
  DirectMessage,
  ImportSource,
  InlineImage,
  LinkPreview,
  Message,
  MessageAttachment,
  MessageKind,
  Profile,
  Reaction,
  SpaceFile,
  SpaceFileKind,
  Workspace,
} from "./types";
