import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import { MetaPixel } from "@/components/MetaPixel";
import { AppShell } from "./shell";
import type { Viewport } from "next";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "CRM",
  description: "CRM",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const bodyBg = "#f4f4f5"; // zinc-50, чтобы не было белого мелькания до загрузки CSS

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: bodyBg }}>
      <body
        className={`${plusJakarta.className} min-h-screen bg-zinc-50 text-zinc-900 antialiased`}
        style={{ backgroundColor: bodyBg }}
      >
        <MetaPixel />
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
