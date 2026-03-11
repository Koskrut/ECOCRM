"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";

export default function CabinetSettingsPage() {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      const res = await fetch("/api/auth/store-logout", {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        router.replace("/login");
        return;
      }
    } catch {
      // ignore
    }
    setLoggingOut(false);
  };

  return (
    <div>
      <h1 className="font-heading text-xl font-semibold text-zinc-900 sm:text-2xl">
        Налаштування
      </h1>
      <p className="mt-1 text-sm text-zinc-500">
        Безпека та вихід з акаунту.
      </p>

      <div className="mt-6 space-y-6">
        <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <h2 className="font-medium text-zinc-900">Пароль</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Якщо ви забули пароль, можна скинути його за допомогою коду, надісланого на ваш телефон.
          </p>
          <Link
            href="/login/forgot-password"
            className="mt-3 inline-block text-sm text-[var(--primary)] hover:underline"
          >
            Відновити пароль →
          </Link>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <h2 className="font-medium text-zinc-900">Вихід</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Вийти з особистого кабінету на цьому пристрої.
          </p>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={handleLogout}
            disabled={loggingOut}
          >
            {loggingOut ? "Вихід…" : "Вийти"}
          </Button>
        </section>
      </div>
    </div>
  );
}
