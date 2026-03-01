import "./globals.css";
import { Plus_Jakarta_Sans } from "next/font/google";
import { AppShell } from "./shell";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "CRM",
  description: "CRM",
};

const bodyBg = "#f4f4f5"; // zinc-50, чтобы не было белого мелькания до загрузки CSS

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" style={{ backgroundColor: bodyBg }}>
      <body
        className={`${plusJakarta.className} min-h-screen bg-zinc-50 text-zinc-900 antialiased`}
        style={{ backgroundColor: bodyBg }}
      >
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
