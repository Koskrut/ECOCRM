"use client";

import { useState } from "react";
import { hasConsent, writeConsent } from "@/lib/consent";

export function ConsentBanner() {
  const [visible, setVisible] = useState(() => (typeof window !== "undefined" ? !hasConsent() : false));

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-3 shadow-lg backdrop-blur supports-[padding:max(0px)]:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-zinc-700">
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
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => {
              writeConsent({ analytics: false, marketing: false });
              setVisible(false);
            }}
            className="min-h-[44px] rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-zinc-700 hover:bg-[var(--surface)]"
          >
            Тільки необхідні
          </button>
          <button
            type="button"
            onClick={() => {
              writeConsent({ analytics: true, marketing: true });
              setVisible(false);
            }}
            className="min-h-[44px] rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
          >
            Прийняти все
          </button>
        </div>
      </div>
    </div>
  );
}

