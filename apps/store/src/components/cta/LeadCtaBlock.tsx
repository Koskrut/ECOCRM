"use client";

import Link from "next/link";
import { trackEvent } from "@/lib/tracking";

type Props = {
  title?: string;
  subtitle?: string;
  compact?: boolean;
};

export function LeadCtaBlock({
  title = "Потрібна допомога з підбором компонентів?",
  subtitle = "Залиште запит і команда SUPREX зв'яжеться з вами з релевантною пропозицією.",
  compact = false,
}: Props) {
  const className = compact
    ? "rounded-2xl border border-[var(--border)] bg-white p-5"
    : "rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8";

  const handleClick = (ctaId: string) => {
    trackEvent("cta_click", { ctaId, placement: compact ? "compact_block" : "primary_block" });
  };

  return (
    <section className={className}>
      <h2 className="font-heading text-2xl font-semibold text-zinc-900">{title}</h2>
      <p className="mt-2 text-zinc-600">{subtitle}</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link
          href="/contacts#lead-price"
          onClick={() => handleClick("get_price")}
          className="rounded-lg bg-[var(--primary)] px-4 py-2.5 text-sm font-medium text-white hover:bg-[var(--primary-hover)]"
        >
          Отримати прайс
        </Link>
        <Link
          href="/contacts#lead-compatibility"
          onClick={() => handleClick("compatibility")}
          className="rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-[var(--surface)]"
        >
          Підібрати сумісність
        </Link>
        <Link
          href="/contacts#lead-consultation"
          onClick={() => handleClick("consultation")}
          className="rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-[var(--surface)]"
        >
          Запросити консультацію
        </Link>
      </div>
    </section>
  );
}

