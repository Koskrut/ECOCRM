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
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{function pick(src){if(!src)return"";var i=String(src).indexOf("tgWebAppData=");if(i<0)return"";var rest=src.slice(i+13);var h=rest.indexOf("#");if(h>=0)rest=rest.slice(0,h);if(/%2[6cC]|%3[dD]/.test(rest)&&!/hash=[a-fA-F0-9]{64}/.test(rest)){rest=rest.split("&")[0];try{rest=decodeURIComponent(rest.replace(/\\+/g," "))}catch(e){}}var hm=rest.match(/hash=([a-fA-F0-9]{64})/);if(!hm||hm.index==null)return"";return rest.slice(0,hm.index+hm[0].length)}function navName(){try{var n=performance.getEntriesByType("navigation")[0];return n&&n.name||""}catch(e){return""}}function save(data){if(!data||!/hash=[a-fA-F0-9]{64}/.test(data))return;window.__SUPREX_TG_INIT_DATA=data;try{sessionStorage.setItem("suprex_tg_init_data",data)}catch(e){}}var data=pick(location.href)||pick(navName());if(!data&&window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.initData)data=window.Telegram.WebApp.initData;if(!data){try{var stored=sessionStorage.getItem("__telegram__initParams");if(stored){var parsed=JSON.parse(stored);if(parsed&&parsed.tgWebAppData)data=parsed.tgWebAppData}}catch(e){}}save(data);var authSrc=location.href+"&"+navName();var auth=authSrc.match(/(?:^|[?&#])tgAuth=([^&#]*)/);if(auth&&auth[1]){try{window.__SUPREX_TG_AUTH=decodeURIComponent(auth[1].replace(/\\+/g," "))}catch(e){window.__SUPREX_TG_AUTH=auth[1]}try{sessionStorage.setItem("suprex_tg_auth",window.__SUPREX_TG_AUTH)}catch(e){}}function wrap(method){var orig=history[method];if(typeof orig!=="function")return;history[method]=function(state,title,url){try{save(pick(location.href)||pick(navName()))}catch(e){}try{var next=url;if(typeof next==="string"&&location.hash&&next.indexOf("#")<0&&/tgWebApp/i.test(location.hash))next+=location.hash;return orig.call(history,state,title,next)}catch(e){}}}wrap("replaceState");wrap("pushState")}catch(e){}})();`,
          }}
        />
      </head>
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
