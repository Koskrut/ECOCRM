import type { Metadata } from "next";
import { LeadCtaBlock } from "@/components/cta/LeadCtaBlock";

export const metadata: Metadata = {
  title: "Про виробництво",
  description:
    "Інформація про виробництво стоматологічних компонентів SUPREX, контроль якості та виробничі можливості.",
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
          Ми підтримуємо стабільність якості через контроль критичних етапів та технічну дисципліну у виробничому процесі.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">Контроль якості</h2>
          <p className="mt-2 text-zinc-600">
            Кожна серія проходить внутрішні перевірки відповідно до технічних специфікацій.
          </p>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">Технологічний підхід</h2>
          <p className="mt-2 text-zinc-600">
            Виробництво орієнтоване на сумісність та відтворюваність компонентів у реальній клінічній роботі.
          </p>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">Матеріали</h2>
          <p className="mt-2 text-zinc-600">
            Використовуються матеріали, релевантні стоматологічним задачам і стабільним поставкам.
          </p>
        </article>
        <article className="rounded-2xl border border-[var(--border)] bg-white p-5">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">Підтримка впровадження</h2>
          <p className="mt-2 text-zinc-600">
            Команда SUPREX допомагає з підбором компонентів та консультацією під кейси клієнта.
          </p>
        </article>
      </section>

      <div className="mt-8">
        <LeadCtaBlock />
      </div>
    </div>
  );
}
