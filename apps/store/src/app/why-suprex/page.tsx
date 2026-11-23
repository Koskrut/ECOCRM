import type { Metadata } from "next";
import Link from "next/link";
import { LeadCtaBlock } from "@/components/cta/LeadCtaBlock";

export const metadata: Metadata = {
  title: "Чому SUPREX",
  description:
    "Компоненти сумісності SUPREX: титанові платформи та абатменти, доставка Новою Поштою по Україні, консультація з підбору.",
  alternates: { canonical: "/why-suprex" },
};

const REASONS = [
  {
    title: "Компоненти сумісності",
    text: "Титанові платформи та абатменти для Straumann RC, Straumann NC, Straumann BLX, Straumann RN, MegaGen AnyRidge, MegaGen AnyOne, MIS Seven, ICX, NeoDent і OSSTEM Regular. Окремо в каталозі — викрутки SUPREX.",
  },
  {
    title: "Підбір сумісності",
    text: "Консультація з підбору: напишіть систему і тип деталі, підкажемо компонент під вашу роботу.",
  },
  {
    title: "Доставка Новою Поштою",
    text: "Відправляємо Новою Поштою по Україні.",
  },
  {
    title: "Оплата",
    text: "Оплата при отриманні або карткою. Телефон +380673597488, пошта info@suprex.dental. Адреса: Дніпро, просп. Б. Хмельницкого 147.",
  },
];

export default function WhySuprexPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <section className="rounded-3xl bg-[var(--primary)] px-6 py-10 text-white sm:px-10">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">Чому SUPREX</h1>
        <p className="mt-3 max-w-3xl text-blue-100">
          SUPREX — виробник стоматологічних компонентів сумісності. Каталог, доставка Новою Поштою і консультація з підбору.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        {REASONS.map((item) => (
          <article key={item.title} className="rounded-2xl border border-[var(--border)] bg-white p-5">
            <h2 className="font-heading text-xl font-semibold text-zinc-900">{item.title}</h2>
            <p className="mt-2 text-zinc-600">{item.text}</p>
          </article>
        ))}
      </section>

      <p className="mt-6 text-sm text-zinc-600">
        <Link href="/systems" className="text-[var(--primary)] hover:underline">
          Каталог систем
        </Link>
      </p>

      <div className="mt-8">
        <LeadCtaBlock />
      </div>
    </div>
  );
}
