import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "Політика конфіденційності SUPREX для обробки персональних даних на сайті.",
  alternates: { canonical: "/privacy-policy" },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-semibold text-zinc-900">Privacy Policy</h1>
      <div className="mt-6 space-y-4 text-zinc-700">
        <p>
          Ми обробляємо персональні дані, які ви добровільно надаєте у формах на сайті SUPREX, виключно для зворотного зв&apos;язку, обробки запиту та підготовки комерційної пропозиції.
        </p>
        <p>
          Дані можуть включати: ім&apos;я, телефон, email, компанію, текст запиту, технічні метадані запиту (сторінка, referrer, UTM-параметри).
        </p>
        <p>
          Ви можете відкликати згоду або запросити уточнення щодо обробки даних, звернувшись за контактами на сторінці «Контакти».
        </p>
      </div>
    </div>
  );
}

