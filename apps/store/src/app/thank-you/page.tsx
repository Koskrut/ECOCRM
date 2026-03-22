"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Button } from "@/components/Button";
import { createCheckoutPaymentLink } from "@/lib/api";
import { buildPublicPayUrl, getCrmPayPageOrigin } from "@/lib/crm-pay-url";
import { PUBLIC_SITE_URL } from "@/lib/public-site-url";

function ThankYouContent() {
  const searchParams = useSearchParams();
  const orderNumber = searchParams.get("orderNumber") ?? "";
  const setPasswordToken = searchParams.get("setPasswordToken");
  const orderPayToken = searchParams.get("orderPayToken");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);

  const handlePay = async () => {
    if (!orderPayToken) return;
    if (!getCrmPayPageOrigin()) {
      setPayErr("Не налаштовано адресу сторінки оплати (NEXT_PUBLIC_CRM_PAY_URL).");
      return;
    }
    setPayErr(null);
    setPayLoading(true);
    try {
      const { payPath } = await createCheckoutPaymentLink(orderPayToken);
      const url = buildPublicPayUrl(payPath);
      if (!url) {
        setPayErr("Не налаштовано адресу сторінки оплати (NEXT_PUBLIC_CRM_PAY_URL).");
        return;
      }
      window.location.href = url;
    } catch (e) {
      setPayErr(e instanceof Error ? e.message : "Не вдалося підготувати оплату");
    } finally {
      setPayLoading(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm || password.length < 6) {
      setErr("Пароль не менше 6 символів і має збігатися з підтвердженням.");
      return;
    }
    setErr(null);
    try {
      await fetch("/api/store/customer/set-password", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: setPasswordToken, password }),
      });
      setSent(true);
    } catch {
      setErr("Не вдалося зберегти пароль.");
    }
  };

  const inputClass =
    "w-full rounded-lg border border-[var(--border)] bg-white px-3 py-2.5 text-zinc-900 outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)]";

  return (
    <div className="px-4 py-12">
      <div className="mx-auto max-w-md rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="font-heading text-xl font-semibold text-zinc-900">
          Дякуємо за замовлення!
        </h1>
        {orderNumber && (
          <p className="mt-2 text-zinc-600">
            Номер замовлення: <strong>{orderNumber}</strong>
          </p>
        )}
        {setPasswordToken && !sent ? (
          <form onSubmit={handleSetPassword} className="mt-6 space-y-3">
            <p className="text-sm text-zinc-600">
              Придумайте пароль для входу в особистий кабінет (замовлення, оплати).
            </p>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <input
              type="password"
              placeholder="Пароль"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
              className={inputClass}
            />
            <input
              type="password"
              placeholder="Підтвердження"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              minLength={6}
              className={inputClass}
            />
            <Button type="submit" className="w-full">
              Зберегти пароль
            </Button>
          </form>
        ) : sent ? (
          <p className="mt-4 text-green-600">
            Пароль збережено. Тепер ви можете увійти в кабінет.
          </p>
        ) : null}
        <div className="mt-6 space-y-4 border-t border-[var(--border)] pt-4">
          {orderPayToken ? (
            <div className="space-y-2">
              {payErr && <p className="text-sm text-red-600">{payErr}</p>}
              <Button
                type="button"
                className="w-full"
                disabled={payLoading}
                onClick={() => void handlePay()}
              >
                {payLoading ? "Зачекайте…" : "Оплатити замовлення"}
              </Button>
            </div>
          ) : null}
          <a
            href={PUBLIC_SITE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-[44px] w-full items-center justify-center rounded-lg border border-[var(--primary)] bg-[var(--primary)] px-4 py-3 text-center text-sm font-semibold text-white transition hover:opacity-90"
          >
            Перейти на сайт SUPREX
          </a>
          <div className="flex flex-wrap gap-4">
            <Link href="/" className="text-[var(--primary)] hover:underline">
              Повернутися в каталог
            </Link>
            <Link href="/login" className="text-[var(--primary)] hover:underline">
              Вхід в кабінет
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ThankYouPage() {
  return (
    <Suspense fallback={<div className="p-8"><div className="h-8 w-48 animate-pulse rounded bg-zinc-200" /></div>}>
      <ThankYouContent />
    </Suspense>
  );
}
