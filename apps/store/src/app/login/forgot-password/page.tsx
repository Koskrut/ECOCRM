"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/Button";

type Step = "phone" | "code";

const API_STORE = "/api/store";
const inputClass =
  "mt-1 w-full min-h-[48px] rounded-lg border border-[var(--border)] bg-white px-3 py-3 text-zinc-900 outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] sm:min-h-[44px] sm:py-2.5";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await fetch(API_STORE + "/auth/password-reset/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { message?: string }).message ?? "Помилка запиту";
        throw new Error(msg);
      }
      setMessage((data as { message?: string }).message ?? "Код надіслано в Telegram.");
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка запиту");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError("Пароль має бути не менше 6 символів");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Паролі не збігаються");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(API_STORE + "/auth/password-reset/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: phone.trim(),
          code: code.trim(),
          newPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = (data as { message?: string }).message ?? "Помилка зміни пароля";
        throw new Error(msg);
      }
      router.push("/login?reset=success");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Помилка зміни пароля");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="font-heading text-xl font-semibold text-zinc-900">
          Скидання пароля
        </h1>

        {step === "phone" ? (
          <>
            <p className="mt-2 text-sm text-zinc-600">
              Введіть номер телефону, з яким ви реєструвались. Код для скидання пароля буде надіслано в Telegram.
            </p>
            {message && (
              <p className="mt-2 text-sm text-green-600">{message}</p>
            )}
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
            <form onSubmit={handleRequestCode} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Номер телефону
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className={inputClass}
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full">
                {loading ? "Надсилання…" : "Надіслати код у Telegram"}
              </Button>
            </form>
          </>
        ) : (
          <>
            {message && (
              <p className="mt-2 text-sm text-green-600">{message}</p>
            )}
            {error && (
              <p className="mt-2 text-sm text-red-600">{error}</p>
            )}
            <form onSubmit={handleConfirm} className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Код з Telegram
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  maxLength={6}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Новий пароль
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={6}
                  required
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Підтвердити пароль
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  minLength={6}
                  required
                  className={inputClass}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setStep("phone");
                    setError(null);
                    setCode("");
                    setNewPassword("");
                    setConfirmPassword("");
                  }}
                >
                  Назад
                </Button>
                <Button
                  type="submit"
                  disabled={loading || code.length < 4 || newPassword.length < 6}
                  className="flex-1"
                >
                  {loading ? "Збереження…" : "Змінити пароль"}
                </Button>
              </div>
            </form>
          </>
        )}

        <p className="mt-6 text-center">
          <Link href="/login" className="text-sm text-[var(--primary)] hover:underline">
            ← Повернутися до входу
          </Link>
        </p>
      </div>
    </div>
  );
}
