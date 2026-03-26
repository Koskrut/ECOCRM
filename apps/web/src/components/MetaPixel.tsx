"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

function isValidPixelId(id: string): boolean {
  return /^\d{8,24}$/.test(id.trim());
}

export function MetaPixel() {
  const pathname = usePathname();
  const [pixelId, setPixelId] = useState<string | null>(null);
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/meta-lead-ads/public", { cache: "no-store" });
        const data = (await res.json()) as { fbPixelId?: string | null };
        const fromApi = data.fbPixelId?.trim() ?? "";
        const fromEnv = process.env.NEXT_PUBLIC_FB_PIXEL_ID?.trim() ?? "";
        const id = fromApi || fromEnv;
        if (!cancelled && id && isValidPixelId(id)) setPixelId(id.trim());
      } catch {
        const fromEnv = process.env.NEXT_PUBLIC_FB_PIXEL_ID?.trim() ?? "";
        if (!cancelled && fromEnv && isValidPixelId(fromEnv)) setPixelId(fromEnv.trim());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!pixelId || typeof window === "undefined" || !window.fbq) return;
    if (prevPathRef.current === null) {
      prevPathRef.current = pathname;
      return;
    }
    if (prevPathRef.current === pathname) return;
    prevPathRef.current = pathname;
    window.fbq("track", "PageView");
  }, [pathname, pixelId]);

  if (!pixelId) return null;

  const inline = `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${pixelId}');
fbq('track', 'PageView');
  `.trim();

  return (
    <Script id="meta-pixel" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: inline }} />
  );
}
