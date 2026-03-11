import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { StoreConfigProvider } from "@/context/StoreConfigContext";
import { Header } from "@/components/Header";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
});

export const metadata: Metadata = {
  title: "SUPREX — Каталог компонентів",
  description: "Інтернет-магазин стоматологічних компонентів сумісності",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${manrope.variable} antialiased min-h-screen flex flex-col`}
      >
        <StoreConfigProvider>
          <Suspense fallback={<header className="h-16 border-b border-[var(--border)] bg-white" />}>
            <Header />
          </Suspense>
          <Suspense fallback={null}>
            <NavBar />
          </Suspense>
          <main className="flex-1">{children}</main>
          <Footer />
        </StoreConfigProvider>
      </body>
    </html>
  );
}
