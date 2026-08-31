"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

export type Settings = {
  /** Whether Fluent emoji should animate (when the pack is available). Default on. */
  emojiAnimated: boolean;
  /**
   * Whether the self-hosted Fluent emoji pack is available. In a real deployment this comes from the
   * server (the operator may or may not install the pack); here it is a simulation so the native
   * fallback can be demonstrated. When false, emoji render with the OS-native glyphs.
   */
  emojiPack: boolean;
};

type SettingsContextValue = Settings & {
  set: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
};

const DEFAULTS: Settings = { emojiAnimated: true, emojiPack: true };

const SettingsContext = createContext<SettingsContextValue>({
  ...DEFAULTS,
  set: () => {},
});

const STORAGE_KEY = "ruchoir.settings";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);

  // Load persisted settings once on mount (client only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      // ignore malformed storage
    }
  }, []);

  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failures
      }
      return next;
    });
  };

  return <SettingsContext.Provider value={{ ...settings, set }}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
