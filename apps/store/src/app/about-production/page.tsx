import type { Metadata } from "next";
import Link from "next/link";
import { IMPLANT_SYSTEM_GROUPS } from "@/lib/categories";
import { LeadCtaBlock } from "@/components/cta/LeadCtaBlock";

export const metadata: Metadata = {
  title: "Про виробництво",
  description:
    "SUPREX виготовляє титанові платформи та абатменти для систем сумісності. Доставка Новою Поштою по Україні, консультація з підбору.",
  alternates: {
    canonical: "/about-production",
  },
};

export default function AboutProductionPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <section className="rounded-3xl bg-[var(--primary)] px-6 py-10 text-white sm:px-10">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">Про виробництво SUPREX</h1>
        <p className="mt-3 max-w-3xl text-blue-100">
          SUPREX виготовляє стоматологічні компоненти сумісності: титанові платформи, абатменти та інші позиції каталогу.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">Що виробляємо</h2>
          <p className="mt-2 text-zinc-600">
            Титанові платформи та абатменти для систем, які є в каталозі. Окремо — викрутки SUPREX для роботи з цими компонентами.
          </p>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">Системи</h2>
          <ul className="mt-3 space-y-1 text-sm text-zinc-700">
            {IMPLANT_SYSTEM_GROUPS.map((system) => (
              <li key={system.id}>
                <Link href={`/systems/${system.slug}`} className="hover:text-[var(--primary)]">
                  {system.name}
                </Link>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5 sm:col-span-2">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">Підбір і доставка</h2>
          <p className="mt-2 text-zinc-600">
            Консультація з підбору сумісності — перед замовленням. Доставка Новою Поштою по Україні. Оплата при отриманні або карткою. Телефон +380673597488, пошта info@suprex.dental. Адреса: Дніпро, просп. Б. Хмельницкого 147.
          </p>
        </article>
      </section>

      <div className="mt-8">
        <LeadCtaBlock />
      </div>
    </div>
  );
}
