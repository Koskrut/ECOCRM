import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Про нас",
  description:
    "Інформація про компанію SUPREX, нашу команду та напрямки роботи у сфері стоматологічних компонентів.",
  alternates: {
    canonical: "/about",
  },
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-heading text-3xl font-semibold text-zinc-900">
        Про нас
      </h1>
      <p className="mt-6 text-zinc-600">
        Тут буде інформація про компанію SUPREX та нашу команду.
      </p>
    </div>
  );
}
