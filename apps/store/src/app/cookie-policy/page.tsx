import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "Політика cookie SUPREX: як використовуються аналітичні та маркетингові cookie.",
  alternates: { canonical: "/cookie-policy" },
};

export default function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold text-zinc-900">Cookie Policy</h1>
      <div className="mt-6 space-y-4 text-zinc-700">
        <p>
          Сайт SUPREX використовує обов&apos;язкові cookie для роботи базового функціоналу, а також опціональні cookie для аналітики та маркетингу за вашою згодою.
        </p>
        <p>
          Ми можемо фіксувати технічні параметри візиту: UTM-мітки, gclid, fbclid, referrer та URL сторінки для оцінки ефективності рекламних кампаній.
        </p>
        <p>
          Ви можете змінити вибір щодо опціональних cookie під час наступного візиту через consent-банер.
        </p>
      </div>
    </div>
  );
}

