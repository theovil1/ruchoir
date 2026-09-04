"use client";

import { useEffect, useState } from "react";
import type { Profile } from "@/lib/data";
import { getUserProfile } from "@/lib/data/api";

/** A minimal profile placeholder built from a display name, before (or without) a real fetch. */
export function minimalProfile(name: string): Profile {
  return {
    name,
    role: "Membre",
    presence: "offline",
    email: "",
    timezone: "Europe/Paris",
    localTime: new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  };
}

/**
 * Fetch a member's real profile from the API by id, falling back to a minimal profile derived from
 * the display name while it loads or when the id is unknown.
 */
export function useProfile(userId: string | undefined, name: string): Profile {
  const [fetched, setFetched] = useState<Profile | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFetched(null);
    if (!userId) return;
    let active = true;
    getUserProfile(userId)
      .then((profile) => active && setFetched(profile))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [userId]);
  return fetched ?? minimalProfile(name);
}
