import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "AGS — Astrology Grammar System",
    template: "%s · AGS",
  },
  description:
    "Deterministic astrology analysis platform. Birth charts, evidence-graded readings, and exportable reports.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
