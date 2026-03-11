"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiHttp } from "../../lib/api/client";

type ResetStep = null | "email" | "code";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");
  const from =
    fromParam && fromParam.startsWith("/") && !fromParam.startsWith("//")
      ? fromParam
      : "/orders";

  const [email, setEmail] = useState("admin@ecocrm.local");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [resetStep, setResetStep] = useState<ResetStep>(null);
  const [resetEmail, setResetEmail] = useState("");
  const [resetMessage, setResetMessage] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiHttp.post("/auth/login", { email, password });
      router.push(from);
      router.refresh();
    } catch (e) {
      const anyErr = e as { response?: { data?: { message?: string; error?: string } } };
      const msg =
        anyErr?.response?.data?.message ||
        anyErr?.response?.data?.error ||
        (e instanceof Error ? e.message : "Login error");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function onRequestReset(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetMessage(null);
    setResetLoading(true);
    try {
      const res = await apiHttp.post<{
        sentVia?: "telegram" | null;
        suggestConnectTelegram?: boolean;
        message?: string;
      }>("/auth/password-reset/request", { email: resetEmail.trim() });
      setResetMessage(res.data?.message ?? "Проверьте Telegram или email.");
      if (res.data?.sentVia === "telegram") {
        setResetStep("code");
      }
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Ошибка запроса");
    } finally {
      setResetLoading(false);
    }
  }

  async function onConfirmReset(e: React.FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetLoading(true);
    try {
      await apiHttp.post("/auth/password-reset/confirm", {
        email: resetEmail.trim(),
        code: resetCode.trim(),
        newPassword: resetPassword,
      });
      router.push(from);
      router.refresh();
    } catch (e) {
      setResetError(e instanceof Error ? e.message : "Ошибка сброса пароля");
    } finally {
      setResetLoading(false);
    }
  }

  const showReset = resetStep !== null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
      <div className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        {showReset ? (
          <>
            <h1 className="text-xl font-bold text-zinc-900">Сброс пароля</h1>
            {resetMessage ? (
              <p className="mt-2 text-sm text-zinc-600">{resetMessage}</p>
            ) : null}
            {resetError ? (
              <div className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-700 border border-red-100">
                {resetError}
              </div>
            ) : null}

            {resetStep === "email" ? (
              <form onSubmit={onRequestReset} className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-zinc-700">Email</label>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  type="email"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                  required
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetStep(null);
                      setResetMessage(null);
                      setResetError(null);
                    }}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    Назад
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    {resetLoading ? "Отправка…" : "Отправить код"}
                  </button>
                </div>
              </form>
            ) : resetStep === "code" ? (
              <form onSubmit={onConfirmReset} className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-zinc-700">Код из Telegram</label>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm font-mono"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  placeholder="000000"
                  maxLength={6}
                />
                <label className="block text-sm font-medium text-zinc-700">Новый пароль</label>
                <input
                  className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                  type="password"
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  minLength={6}
                  required
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setResetStep("email")}
                    className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
                  >
                    Назад
                  </button>
                  <button
                    type="submit"
                    disabled={resetLoading || resetCode.length < 4 || resetPassword.length < 6}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    {resetLoading ? "Сохранение…" : "Сохранить пароль"}
                  </button>
                </div>
              </form>
            ) : null}
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-zinc-900">Вход</h1>
            <p className="mt-1 text-sm text-zinc-500">Email и пароль</p>

            {error ? (
              <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-100">
                {error}
              </div>
            ) : null}

            <form onSubmit={onSubmit} className="mt-4 space-y-3">
              <label className="block text-sm font-medium text-zinc-700">Email</label>
              <input
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
              <label className="block text-sm font-medium text-zinc-700">Пароль</label>
              <input
                className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button type="submit" disabled={loading} className="btn-primary w-full py-2">
                {loading ? "Вход…" : "Войти"}
              </button>
              <p className="text-center">
                <button
                  type="button"
                  onClick={() => {
                    setResetStep("email");
                    setResetEmail(email);
                    setResetMessage(null);
                    setResetError(null);
                  }}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                >
                  Сбросить пароль
                </button>
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
