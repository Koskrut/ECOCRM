import type { Metadata } from "next";
import { LeadCtaBlock } from "@/components/cta/LeadCtaBlock";

export const metadata: Metadata = {
  title: "Про компанію",
  description:
    "SUPREX: про компанію, експертизу, сервіс і підхід до підтримки стоматологічних команд.",
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
          SUPREX спеціалізується на стоматологічних компонентах сумісності та супроводжує клієнта від підбору рішень до стабільного постачання.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">Що ми робимо</h2>
          <p className="mt-2 text-zinc-600">
            Постачаємо компоненти для щоденної клінічної роботи та допомагаємо з вибором під конкретні задачі.
          </p>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">Як працюємо</h2>
          <p className="mt-2 text-zinc-600">
            Прозорий процес комунікації, швидкий зворотний зв&apos;язок та орієнтація на практичний результат для клієнта.
          </p>
        </article>
      </section>

      <div className="mt-8">
        <LeadCtaBlock />
      </div>
    </div>
  );
}
