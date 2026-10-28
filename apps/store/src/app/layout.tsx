import type { Metadata } from "next";
import { Suspense } from "react";
import Script from "next/script";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { StoreConfigProvider } from "@/context/StoreConfigContext";
import { TelegramWebAppProvider } from "@/context/TelegramWebAppContext";
import { Header } from "@/components/Header";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { ConsentBanner } from "@/components/ConsentBanner";
import { TrackingBootstrap } from "@/components/TrackingBootstrap";
import { TelegramShell } from "@/components/TelegramShell";
import { SITE_URL } from "@/lib/site";

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
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SUPREX — стоматологічні компоненти сумісності",
    template: "%s | SUPREX",
  },
  description:
    "SUPREX — каталог стоматологічних компонентів сумісності: платформи, аналоги, формувачі ясен, трансфери та інші компоненти.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "SUPREX",
    locale: "uk_UA",
    title: "SUPREX — стоматологічні компоненти сумісності",
    description:
      "Каталог стоматологічних компонентів сумісності SUPREX.",
  },
  robots: {
    index: true,
    follow: true,
  },
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
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <StoreConfigProvider>
          <TelegramWebAppProvider>
            <CartProvider>
              <TrackingBootstrap />
              <TelegramShell>
                <Suspense fallback={<header className="h-16 border-b border-[var(--border)] bg-white" />}>
                  <Header />
                </Suspense>
                <Suspense fallback={null}>
                  <NavBar />
                </Suspense>
                <main className="flex-1">{children}</main>
                <Footer />
                <ConsentBanner />
              </TelegramShell>
            </CartProvider>
          </TelegramWebAppProvider>
        </StoreConfigProvider>
      </body>
    </html>
  );
}
