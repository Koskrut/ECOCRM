"use client";

import { useEffect, useRef, useState } from "react";
import { hasConsent, writeConsent } from "@/lib/consent";

export function ConsentBanner() {
  const [visible, setVisible] = useState(() => (typeof window !== "undefined" ? !hasConsent() : false));
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (!visible || root.getAttribute("data-tg-miniapp") === "1") {
      root.style.setProperty("--consent-banner-offset", "0px");
      return;
    }
    const el = bannerRef.current;
    const apply = () => {
      const height = el?.offsetHeight ?? 0;
      root.style.setProperty("--consent-banner-offset", height ? `${height + 12}px` : "0px");
    };
    apply();
    const observer = new ResizeObserver(apply);
    if (el) observer.observe(el);
    return () => {
      observer.disconnect();
      root.style.setProperty("--consent-banner-offset", "0px");
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={bannerRef}
      data-consent-banner
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-white/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <p className="text-xs leading-snug text-zinc-700 sm:text-sm">
          Ми використовуємо cookie для аналітики та маркетингових подій. Деталі у{" "}
          <a href="/cookie-policy" className="text-[var(--primary)] hover:underline">
            Cookie Policy
          </a>{" "}
          та{" "}
          <a href="/privacy-policy" className="text-[var(--primary)] hover:underline">
            Privacy Policy
          </a>
          .
        </p>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:shrink-0">
          <button
            type="button"
            onClick={() => {
              writeConsent({ analytics: false, marketing: false });
              setVisible(false);
            }}
            className="min-h-[36px] rounded-lg border border-[var(--border)] px-2 py-1 text-xs text-zinc-700 hover:bg-[var(--surface)] sm:min-h-[44px] sm:px-3 sm:text-sm"
          >
            Тільки необхідні
          </button>
          <button
            type="button"
            onClick={() => {
              writeConsent({ analytics: true, marketing: true });
              setVisible(false);
            }}
            className="min-h-[36px] rounded-lg bg-[var(--primary)] px-2 py-1 text-xs font-medium text-white hover:bg-[var(--primary-hover)] sm:min-h-[44px] sm:px-3 sm:text-sm"
          >
            Прийняти все
          </button>
        </div>
      </div>
    </div>
  );
}
