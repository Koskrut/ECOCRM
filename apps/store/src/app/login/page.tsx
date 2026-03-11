"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { login } from "@/lib/api";
import { Button } from "@/components/Button";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const resetSuccess = searchParams.get("reset") === "success";
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loginDebug, setLoginDebug] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoginDebug(null);
    setLoading(true);
    try {
      await login(phone.trim(), password);
      router.push("/cabinet");
      router.refresh();
    } catch (err) {
      const e = err as Error & { __debug?: unknown };
      setError(e.message ?? "Помилка входу");
      setLoginDebug(e.__debug ?? null);
      setLoading(false);
    }
  };

  const inputClass =
    "mt-1 w-full min-h-[48px] rounded-lg border border-[var(--border)] bg-white px-3 py-3 text-zinc-900 outline-none transition focus:border-[var(--primary)] focus:ring-1 focus:ring-[var(--primary)] sm:min-h-[44px] sm:py-2.5";

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-12 sm:px-6">
      <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-white p-6 shadow-sm">
        <h1 className="font-heading text-xl font-semibold text-zinc-900">
          Вхід в кабінет
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          За номером телефону та паролем
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {resetSuccess && (
            <p className="text-sm text-green-600">Пароль змінено. Увійдіть.</p>
          )}
          {error && (
            <div>
              <p className="text-sm text-red-600">{error}</p>
              {loginDebug != null && (
                <pre className="mt-2 max-h-40 overflow-auto rounded bg-zinc-100 p-2 text-xs text-zinc-700">
                  {JSON.stringify(loginDebug, null, 2)}
                </pre>
              )}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-zinc-700">Телефон</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700">Пароль</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Вхід…" : "Увійти"}
          </Button>
          <p className="text-center">
            <Link
              href="/login/forgot-password"
              className="text-sm text-[var(--primary)] hover:underline"
            >
              Забули пароль?
            </Link>
          </p>
        </form>
        <p className="mt-4 text-center text-sm text-zinc-500">
          Немає акаунту?{" "}
          <Link href="/register" className="text-[var(--primary)] hover:underline">
            Зареєструватися
          </Link>
        </p>
        <p className="mt-1 text-center text-sm text-zinc-500">
          <Link href="/" className="text-[var(--primary)] hover:underline">
            До каталогу
          </Link>
        </p>
      </div>
    </div>
  );
}
