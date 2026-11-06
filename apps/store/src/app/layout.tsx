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

/** Capture Telegram launch params before the SDK/Next.js rewrite the URL.
 *  Android Telegram WebView crashes on history.pushState and flashes Oops on
 *  location.assign. Swallow history; queue in-app clicks for SPA navigation. */
const TELEGRAM_BOOT_SCRIPT = `(function(){try{function put(k,v){try{sessionStorage.setItem(k,v)}catch(e){}try{localStorage.setItem(k,v)}catch(e){}}function get(k){try{var a=sessionStorage.getItem(k);if(a)return a}catch(e){}try{return localStorage.getItem(k)}catch(e){}return null}function pick(src){if(!src)return"";var i=String(src).indexOf("tgWebAppData=");if(i<0)return"";var rest=src.slice(i+13);var h=rest.indexOf("#");if(h>=0)rest=rest.slice(0,h);if(/%2[6cC]|%3[dD]/.test(rest)&&!/hash=[a-fA-F0-9]{64}/.test(rest)){rest=rest.split("&")[0];try{rest=decodeURIComponent(rest.replace(/\\+/g," "))}catch(e){}}var hm=rest.match(/hash=([a-fA-F0-9]{64})/);if(!hm||hm.index==null)return"";return rest.slice(0,hm.index+hm[0].length)}function navName(){try{var n=performance.getEntriesByType("navigation")[0];return n&&n.name||""}catch(e){return""}}function save(data){if(!data||!/hash=[a-fA-F0-9]{64}/.test(data))return;window.__SUPREX_TG_INIT_DATA=data;put("suprex_tg_init_data",data)}var data=pick(location.href)||pick(navName());if(!data&&window.Telegram&&window.Telegram.WebApp&&window.Telegram.WebApp.initData)data=window.Telegram.WebApp.initData;if(!data){try{var stored=sessionStorage.getItem("__telegram__initParams");if(stored){var parsed=JSON.parse(stored);if(parsed&&parsed.tgWebAppData)data=parsed.tgWebAppData}}catch(e){}}save(data);var authSrc=location.href+"&"+navName();var auth=authSrc.match(/(?:^|[?&#])tgAuth=([^&#]*)/);if(auth&&auth[1]){try{window.__SUPREX_TG_AUTH=decodeURIComponent(auth[1].replace(/\\+/g," "))}catch(e){window.__SUPREX_TG_AUTH=auth[1]}put("suprex_tg_auth",window.__SUPREX_TG_AUTH)}else if(!window.__SUPREX_TG_AUTH){window.__SUPREX_TG_AUTH=get("suprex_tg_auth")||""}window.__SUPREX_TG_QUEUE=window.__SUPREX_TG_QUEUE||[];function goTo(go){if(window.__SUPREX_TG_GO){window.__SUPREX_TG_GO(go);return}window.__SUPREX_TG_QUEUE.push(go)}var ua=navigator.userAgent||"";var isAndroid=/Android/i.test(ua);var isTg=/Telegram/i.test(ua)||/tgWebApp/i.test(location.hash+location.search)||/(?:^|[?&#])tgAuth=/.test(location.href)||Boolean(window.__SUPREX_TG_AUTH);if(!isTg&&(get("suprex_tg_auth")||get("suprex_tg_init_data")||get("suprex_tg_miniapp")==="1"))isTg=true;if(isTg){put("suprex_tg_miniapp","1");try{document.documentElement.setAttribute("data-tg-miniapp","1")}catch(e){}}function wrap(method){var orig=history[method];if(typeof orig!=="function")return;history[method]=function(){try{save(pick(location.href)||pick(navName()))}catch(e){}if(isAndroid&&isTg)return;try{return orig.apply(this,arguments)}catch(e){}}}wrap("replaceState");wrap("pushState");if(isAndroid&&isTg){document.addEventListener("click",function(ev){if(ev.defaultPrevented||ev.metaKey||ev.ctrlKey||ev.shiftKey||ev.altKey)return;if(ev.button)return;var t=ev.target;if(!t||!t.closest)return;var a=t.closest("a[href]");if(!a||a.target==="_blank"||a.hasAttribute("download"))return;var href=a.getAttribute("href");if(!href||href.charAt(0)==="#"||href.indexOf("mailto:")===0||href.indexOf("tel:")===0)return;var go=href;try{var u=new URL(href,location.href);if(u.origin!==location.origin)return;go=u.pathname+u.search}catch(e){if(href.charAt(0)!=="/")return}ev.preventDefault();ev.stopPropagation();if(ev.stopImmediatePropagation)ev.stopImmediatePropagation();goTo(go)},true)}}catch(e){}})();`;

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
            __html: TELEGRAM_BOOT_SCRIPT,
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
