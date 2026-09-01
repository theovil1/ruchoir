/**
 * Notification model for the app shell.
 *
 * Notifications are derived once from the seed message map (mentions, thread replies and unread
 * direct messages) into a flat, mutable inbox that the notification center reads. Read state lives
 * on each item so marking one (or all) read never rebuilds the list. Per-channel preferences are
 * applied at display time (see `passesPref`) so muting a channel hides its notifications and drops
 * them from the unread count without discarding the read state of the others.
 */
import type { Channel, DirectMessage } from "@/lib/data";
import type { MessageMap } from "./activity";

export type NotifKind = "mention" | "reply" | "dm";

export type AppNotification = {
  id: string;
  kind: NotifKind;
  channelId: string;
  /** "#canal" for channels, the person's name for direct messages. */
  label: string;
  isDm: boolean;
  /** Who triggered the notification (drives the avatar). */
  actor: string;
  /** The message to jump to when the notification is opened. */
  messageId: number;
  /** Short one-line preview of the triggering message. */
  preview: string;
  /** Human time carried from the source message (e.g. "10:24"). */
  time: string;
  read: boolean;
};

/** How much a channel notifies. `all` is the default when a channel has no explicit preference. */
export type NotifLevel = "all" | "mentions" | "none";

export type ChannelNotifPref = {
  level: NotifLevel;
  muted: boolean;
};

export const DEFAULT_CHANNEL_PREF: ChannelNotifPref = { level: "all", muted: false };

/** Global notification preferences, persisted with the rest of the settings. */
export type NotifPrefs = {
  /** Master switch: off silences every channel. */
  enabled: boolean;
  /** Play a sound on a new notification. */
  sound: boolean;
  /** Also notify on @channel / @here, not only direct @mentions. */
  channelMentions: boolean;
  /** Suppress notifications during the configured quiet hours. */
  quietHours: boolean;
  /** Quiet-hours start, "HH:MM" (24h). May be later than `quietTo` for an overnight window. */
  quietFrom: string;
  /** Quiet-hours end, "HH:MM" (24h). */
  quietTo: string;
};

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  enabled: true,
  sound: false,
  channelMentions: true,
  quietHours: false,
  quietFrom: "21:00",
  quietTo: "08:00",
};

/** Human summary of the quiet-hours window, e.g. "21 h 00 - 8 h 00" (French, no leading zero on hours). */
export function quietHoursLabel(prefs: NotifPrefs): string {
  // Defensive: settings persisted before these keys existed (or kept across an HMR reload) may lack
  // them, so fall back to the defaults rather than crashing on an undefined value.
  const fmt = (t: string) => {
    const [h = "0", m = "00"] = (t || "").split(":");
    return `${Number(h)} h ${m}`;
  };
  return `${fmt(prefs.quietFrom ?? DEFAULT_NOTIF_PREFS.quietFrom)} - ${fmt(prefs.quietTo ?? DEFAULT_NOTIF_PREFS.quietTo)}`;
}

const KIND_VERB: Record<NotifKind, string> = {
  mention: "vous a mentionné",
  reply: "a répondu dans un fil",
  dm: "vous a envoyé un message",
};

/** Short human sentence for a notification, e.g. "Alice vous a mentionné". */
export function notifSummary(n: AppNotification): string {
  return `${n.actor} ${KIND_VERB[n.kind]}`;
}

function labelFor(channelId: string, channels: Channel[], dms: DirectMessage[]): { label: string; isDm: boolean } {
  const channel = channels.find((c) => c.id === channelId);
  if (channel) return { label: `#${channel.name}`, isDm: false };
  const dm = dms.find((d) => d.id === channelId);
  if (dm) return { label: dm.name, isDm: true };
  return { label: channelId, isDm: false };
}

function preview(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  if (!clean) return "(pièce jointe)";
  return clean.length > 120 ? `${clean.slice(0, 117)}…` : clean;
}

/**
 * Derive the initial notification inbox from the seed data. Mentions and thread replies are scanned
 * from every conversation; unread direct messages surface their latest incoming message. The most
 * recent activity (by scan position) is listed first. `me` is excluded as an actor: you are never
 * notified about your own messages.
 */
export function buildNotifications(
  map: MessageMap,
  channels: Channel[],
  dms: DirectMessage[],
  me: string,
): AppNotification[] {
  const firstName = me.split(" ")[0];
  const items: AppNotification[] = [];

  for (const [channelId, messages] of Object.entries(map)) {
    const { label, isDm } = labelFor(channelId, channels, dms);
    for (const m of messages) {
      if (m.deleted || m.kind === "system" || m.author === me) continue;
      const mentionsMe = m.body.includes(`@${me}`) || m.body.includes(`@${firstName}`);
      if (mentionsMe) {
        items.push({
          id: `mention:${channelId}:${m.id}`,
          kind: "mention",
          channelId,
          label,
          isDm,
          actor: m.author,
          messageId: m.id,
          preview: preview(m.body),
          time: m.time,
          read: false,
        });
      } else if (!isDm && m.replies && m.replies > 0) {
        items.push({
          id: `reply:${channelId}:${m.id}`,
          kind: "reply",
          channelId,
          label,
          isDm,
          actor: m.author,
          messageId: m.id,
          preview: preview(m.body),
          time: m.time,
          read: false,
        });
      }
    }
  }

  // Unread direct messages: surface the latest incoming message of each.
  for (const dm of dms) {
    if (!dm.unread || dm.bot) continue;
    const messages = map[dm.id] ?? [];
    const last = [...messages].reverse().find((m) => m.author !== me && !m.deleted);
    if (!last) continue;
    items.push({
      id: `dm:${dm.id}:${last.id}`,
      kind: "dm",
      channelId: dm.id,
      label: dm.name,
      isDm: true,
      actor: last.author,
      messageId: last.id,
      preview: preview(last.body),
      time: last.time,
      read: false,
    });
  }

  // Cap the inbox so the exploration stays legible; mentions and DMs sort ahead of thread replies.
  const weight: Record<NotifKind, number> = { dm: 0, mention: 1, reply: 2 };
  return items.sort((a, b) => weight[a.kind] - weight[b.kind]).slice(0, 12);
}

/** Whether a notification should be shown given the channel and global preferences. */
export function passesPref(
  n: AppNotification,
  channelPref: ChannelNotifPref | undefined,
  prefs: NotifPrefs,
): boolean {
  if (!prefs.enabled) return false;
  const pref = channelPref ?? DEFAULT_CHANNEL_PREF;
  if (pref.muted || pref.level === "none") return false;
  if (pref.level === "mentions") return n.kind === "mention" || n.kind === "dm";
  return true;
}
