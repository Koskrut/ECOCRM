"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type GoogleSheetConfigResponse = {
  webhookUrl?: string;
  webhookSecretOutMasked?: string;
  webhookSecretInMasked?: string;
  sendOnReadyToShip?: boolean;
};

function getApiErrorMessage(e: unknown, fallback: string) {
  const msg =
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      ?.message ??
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error;
  return msg ?? (e instanceof Error ? e.message : fallback);
}

export default function GoogleSheetSettingsPage() {
  const [config, setConfig] = useState<GoogleSheetConfigResponse>({});
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookSecretOut, setWebhookSecretOut] = useState("");
  const [webhookSecretIn, setWebhookSecretIn] = useState("");
  const [sendOnReadyToShip, setSendOnReadyToShip] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<GoogleSheetConfigResponse>("/settings/google-sheet");
      const data = res.data ?? {};
      setConfig(data);
      setWebhookUrl(data.webhookUrl ?? "");
      setSendOnReadyToShip(data.sendOnReadyToShip !== false);
      setWebhookSecretOut("");
      setWebhookSecretIn("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load settings"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        webhookUrl: webhookUrl.trim() || undefined,
        sendOnReadyToShip,
      };
      if (webhookSecretOut !== "") body.webhookSecretOut = webhookSecretOut;
      if (webhookSecretIn !== "") body.webhookSecretIn = webhookSecretIn;
      const res = await apiHttp.patch<GoogleSheetConfigResponse>("/settings/google-sheet", body);
      const data = res.data ?? {};
      setConfig(data);
      setWebhookSecretOut("");
      setWebhookSecretIn("");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Back to Settings
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Google-таблиця (1С)</h1>
          <p className="mt-1 text-sm text-zinc-500">
            URL webhook Apps Script для відправки замовлень у таблицю. Секрет для вхідного push від 1С.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">URL webhook таблиці</label>
                <p className="mt-0.5 text-xs text-zinc-500">
                  URL розгорнутого Apps Script (Web App), куди CRM відправляє дані замовлення.
                </p>
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://script.google.com/..."
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Секрет для вихідних запитів (опційно)
                </label>
                <input
                  type="password"
                  value={webhookSecretOut}
                  onChange={(e) => setWebhookSecretOut(e.target.value)}
                  placeholder={
                    config.webhookSecretOutMasked
                      ? `Поточний: ${config.webhookSecretOutMasked}`
                      : "Залиште порожнім, щоб не змінювати"
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Секрет для вхідного push (1С / Apps Script)
                </label>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Заголовок X-Webhook-Secret при виклику POST /integrations/google-sheet/order-documents.
                </p>
                <input
                  type="password"
                  value={webhookSecretIn}
                  onChange={(e) => setWebhookSecretIn(e.target.value)}
                  placeholder={
                    config.webhookSecretInMasked
                      ? `Поточний: ${config.webhookSecretInMasked}`
                      : "Залиште порожнім, щоб не змінювати"
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="sendOnReadyToShip"
                  checked={sendOnReadyToShip}
                  onChange={(e) => setSendOnReadyToShip(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                <label htmlFor="sendOnReadyToShip" className="text-sm text-zinc-700">
                  Відправляти замовлення в таблицю при переході в статус «Готово к отправке»
                </label>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between">
              <p className="text-xs text-zinc-500">Тільки ADMIN може змінювати ці налаштування.</p>
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
              >
                {saving ? "Збереження…" : "Зберегти"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
