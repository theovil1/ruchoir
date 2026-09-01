import type { Presence } from "@/components/ds";

/** Human label for a presence state. */
export function presenceLabel(presence: Presence): string {
  switch (presence) {
    case "online":
      return "En ligne";
    case "away":
      return "Absent";
    case "busy":
      return "Occupé";
    default:
      return "Hors ligne";
  }
}
