import type { Metadata } from "next";
import Link from "next/link";
import { CATALOG_SYSTEMS } from "@/lib/categories";
import { LeadCtaBlock } from "@/components/cta/LeadCtaBlock";

export const metadata: Metadata = {
  title: "Про компанію",
  description:
    "SUPREX — виробник стоматологічних компонентів сумісності: титанові платформи та абатменти, доставка Новою Поштою, консультація з підбору.",
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <section className="rounded-3xl bg-[var(--primary)] px-6 py-10 text-white sm:px-10">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">Про компанію SUPREX</h1>
        <p className="mt-3 max-w-3xl text-blue-100">
          SUPREX — виробник стоматологічних компонентів сумісності. У каталозі є титанові платформи, абатменти та інші компоненти для систем, з якими працює клініка.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">Системи в каталозі</h2>
          <ul className="mt-3 space-y-1 text-sm text-zinc-700">
            {CATALOG_SYSTEMS.map((system) => (
              <li key={system.id}>
                <Link href={`/systems/${system.slug}`} className="hover:text-[var(--primary)]">
                  {system.name}
                </Link>
              </li>
            ))}
          </ul>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">Доставка і підбір</h2>
          <p className="mt-2 text-zinc-600">
            Доставка Новою Поштою по Україні. Оплата при отриманні або карткою. Якщо потрібен підбір сумісності, залиште запит — підкажемо компонент під вашу систему.
          </p>
          <p className="mt-3 text-sm text-zinc-600">
            Телефон +380673597488, пошта info@suprex.dental. Адреса: Дніпро, просп. Б. Хмельницкого 147.
          </p>
        </article>
      </section>

      <div className="mt-8">
        <LeadCtaBlock />
      </div>
    </div>
  );
}
