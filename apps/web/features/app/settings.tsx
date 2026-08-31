"use client";

import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

/** The four shipped themes. RuchUI (warm cream + terracotta) is the default. */
export type ThemeName = "ruchui" | "light" | "ruchui-dark" | "dark";

export const THEMES: ThemeName[] = ["ruchui", "light", "ruchui-dark", "dark"];

function isTheme(value: unknown): value is ThemeName {
  return typeof value === "string" && (THEMES as string[]).includes(value);
}

export type Settings = {
  /** Active colour theme, applied as data-theme on <html>. Default RuchUI. */
  theme: ThemeName;
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

const DEFAULTS: Settings = { theme: "ruchui", emojiAnimated: true, emojiPack: true };

const SettingsContext = createContext<SettingsContextValue>({
  ...DEFAULTS,
  set: () => {},
});

const STORAGE_KEY = "ruchoir.settings";

/** Read the theme the pre-paint script (see layout.tsx) already applied, so the first render matches. */
function initialTheme(): ThemeName {
  if (typeof document !== "undefined") {
    const t = document.documentElement.dataset.theme;
    if (isTheme(t)) return t;
  }
  return DEFAULTS.theme;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULTS, theme: initialTheme() }));

  // Load persisted settings once on mount (client only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setSettings({ ...DEFAULTS, ...parsed, theme: isTheme(parsed.theme) ? parsed.theme : DEFAULTS.theme });
      }
    } catch {
      // ignore malformed storage
    }
  }, []);

  // Reflect the active theme onto <html> so the CSS [data-theme] blocks apply.
  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
  }, [settings.theme]);

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
