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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
