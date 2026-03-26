import type { Metadata } from "next";
import { LeadCtaBlock } from "@/components/cta/LeadCtaBlock";

export const metadata: Metadata = {
  title: "Чому SUPREX",
  description: "Переваги SUPREX: контроль якості, сумісність компонентів та технічна підтримка.",
  alternates: { canonical: "/why-suprex" },
};

const REASONS = [
  { title: "Стабільна сумісність", text: "Компоненти проєктуються під прогнозовану посадку у щоденній практиці." },
  { title: "Контроль виробництва", text: "Внутрішні перевірки на критичних етапах виготовлення кожної серії." },
  { title: "Оперативна підтримка", text: "Підбір, консультація і допомога в запуску замовлення без затримок." },
  { title: "Поставки по Україні", text: "Швидка логістика та прозорий процес обробки запитів." },
];

export default function WhySuprexPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <section className="rounded-3xl bg-[var(--primary)] px-6 py-10 text-white sm:px-10">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">Чому SUPREX</h1>
        <p className="mt-3 max-w-3xl text-blue-100">
          Ми сфокусовані на практичному результаті: сумісність, стабільність поставок та технічна підтримка для команди клієнта.
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

      <div className="mt-8">
        <LeadCtaBlock />
      </div>
    </div>
  );
}

