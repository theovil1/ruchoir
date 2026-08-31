import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ruchoir",
  description:
    "Sovereign, open-core workspace: real-time team messaging and file sharing.",
  applicationName: "Ruchoir",
};

export const viewport: Viewport = {
  themeColor: "#c65d45",
  width: "device-width",
  initialScale: 1,
};

// Applied before first paint so the stored theme is in place with no flash of the default.
// Kept inline and tiny: reads the persisted setting and stamps data-theme on <html>.
const themeBootstrap = `try{var t=JSON.parse(localStorage.getItem("ruchoir.settings")||"{}").theme;if(t==="light"||t==="ruchui-dark"||t==="dark")document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // No data-theme is rendered server-side: the CSS :root IS the default RuchUI theme, and the
    // pre-paint script only stamps data-theme for a non-default stored theme. Because React never
    // renders the attribute, the script-added one is unmanaged and cannot cause a hydration mismatch.
    // suppressHydrationWarning still covers the injected <script> text differing across environments.
    // The UI copy is French, so the document language is fr: a screen reader must pick the French
    // speech synthesiser to pronounce the content correctly (the repo/code convention stays English).
    <html lang="fr" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
