"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { trackEvent } from "@/lib/tracking";

export default function LeadThankYouPage() {
  const params = useSearchParams();
  const form = params.get("form") ?? "unknown";
  const leadId = params.get("leadId") ?? "";

  useEffect(() => {
    trackEvent("thank_you_view", { formType: form, leadId });
  }, [form, leadId]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6 sm:p-8">
        <h1 className="font-heading text-2xl font-semibold text-zinc-900">Дякуємо за звернення</h1>
        <p className="mt-3 text-zinc-600">
          Ми отримали ваш запит і зв&apos;яжемося з вами найближчим часом.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/" className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]">
            На головну
          </Link>
          <Link href="/contacts" className="rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-[var(--surface)]">
            Контакти
          </Link>
        </div>
      </div>
    </div>
  );
}

