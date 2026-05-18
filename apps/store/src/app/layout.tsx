import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { CartProvider } from "@/context/CartContext";
import { StoreConfigProvider } from "@/context/StoreConfigContext";
import { Header } from "@/components/Header";
import { NavBar } from "@/components/NavBar";
import { Footer } from "@/components/Footer";
import { ConsentBanner } from "@/components/ConsentBanner";
import { TrackingBootstrap } from "@/components/TrackingBootstrap";
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
        <StoreConfigProvider>
          <CartProvider>
            <TrackingBootstrap />
            <Suspense fallback={<header className="h-16 border-b border-[var(--border)] bg-white" />}>
              <Header />
            </Suspense>
            <Suspense fallback={null}>
              <NavBar />
            </Suspense>
            <main className="flex-1">{children}</main>
            <Footer />
            <ConsentBanner />
          </CartProvider>
        </StoreConfigProvider>
      </body>
    </html>
  );
}
