import type { Metadata } from "next";
import { LeadCtaBlock } from "@/components/cta/LeadCtaBlock";
import { ShortLeadForm } from "@/components/forms/ShortLeadForm";
import { CompatibilityForm } from "@/components/forms/CompatibilityForm";
import { ConsultationForm } from "@/components/forms/ConsultationForm";
import { TrackedLink } from "@/components/TrackedLink";

export const metadata: Metadata = {
  title: "Контакти",
  description:
    "Контакти SUPREX: адреса, телефон та email для зв’язку щодо стоматологічних компонентів.",
  alternates: {
    canonical: "/contacts",
  },
};

export default function ContactsPage() {
  const whatsappUrl = process.env.NEXT_PUBLIC_WHATSAPP_URL?.trim() || "";
  const telegramUrl = process.env.NEXT_PUBLIC_TELEGRAM_URL?.trim() || "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <section className="rounded-3xl bg-[var(--primary)] px-6 py-10 text-white sm:px-10">
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">Контакти SUPREX</h1>
        <p className="mt-3 max-w-3xl text-blue-100">
          Залиште запит через форму або зв&apos;яжіться з нами напряму. Ми підготуємо релевантну пропозицію під ваш кейс.
        </p>
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-white p-5 text-zinc-700 lg:col-span-1">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">Прямий зв&apos;язок</h2>
          <p className="mt-4">
            <span className="font-medium text-zinc-800">Адреса:</span>
            <br />
            Дніпро, просп. Б. Хмельницкого 147
          </p>
          <p className="mt-3">
            <span className="font-medium text-zinc-800">Телефон:</span>
            <br />
            <TrackedLink
              href="tel:+380673597488"
              className="text-[var(--primary)] hover:underline"
              eventName="call_click"
              payload={{ placement: "contacts" }}
            >
              067 359 74 88
            </TrackedLink>
          </p>
          <p className="mt-3">
            <span className="font-medium text-zinc-800">Email:</span>
            <br />
            <TrackedLink
              href="mailto:info@suprex.dental"
              className="text-[var(--primary)] hover:underline"
              eventName="cta_click"
              payload={{ ctaId: "email_click", placement: "contacts" }}
            >
              info@suprex.dental
            </TrackedLink>
          </p>
          {(whatsappUrl || telegramUrl) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {whatsappUrl && (
                <TrackedLink
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface)]"
                  eventName="whatsapp_click"
                  payload={{ placement: "contacts" }}
                >
                  WhatsApp
                </TrackedLink>
              )}
              {telegramUrl && (
                <TrackedLink
                  href={telegramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-[var(--surface)]"
                  eventName="cta_click"
                  payload={{ ctaId: "telegram_click", placement: "contacts" }}
                >
                  Telegram
                </TrackedLink>
              )}
            </div>
          )}
        </div>

        <section className="space-y-6 lg:col-span-2">
          <article id="lead-price" className="rounded-2xl border border-[var(--border)] bg-white p-5">
            <h2 className="font-heading text-xl font-semibold text-zinc-900">Отримати прайс</h2>
            <p className="mt-1 text-sm text-zinc-600">Коротка форма для швидкого контакту.</p>
            <div className="mt-4">
              <ShortLeadForm />
            </div>
          </article>

          <article id="lead-compatibility" className="rounded-2xl border border-[var(--border)] bg-white p-5">
            <h2 className="font-heading text-xl font-semibold text-zinc-900">Підібрати сумісність</h2>
            <p className="mt-1 text-sm text-zinc-600">Опишіть запит, і ми підберемо рішення.</p>
            <div className="mt-4">
              <CompatibilityForm />
            </div>
          </article>

          <article id="lead-consultation" className="rounded-2xl border border-[var(--border)] bg-white p-5">
            <h2 className="font-heading text-xl font-semibold text-zinc-900">Запросити консультацію</h2>
            <p className="mt-1 text-sm text-zinc-600">Для клінік, лікарів, лабораторій і партнерів.</p>
            <div className="mt-4">
              <ConsultationForm />
            </div>
          </article>
        </section>
      </div>

      <div className="mt-8">
        <LeadCtaBlock compact />
      </div>
    </div>
  );
}
