"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { ErrorPanel } from "@/components/feedback";

type NovaPoshtaSettings = {
  isEnabled?: boolean;
  apiUrl?: string;
  apiTimeoutMs?: number;
  senderCityRef?: string;
  senderWarehouseRef?: string;
  senderCounterpartyRef?: string;
  senderContactRef?: string;
  senderPhone?: string;
  defaultPayerType?: string;
  defaultPaymentMethod?: string;
  apiKeyMasked?: string;
};

export default function NovaPoshtaSettingsPage() {
  const [config, setConfig] = useState<NovaPoshtaSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [clearStoredApiKey, setClearStoredApiKey] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiHttp.get<NovaPoshtaSettings>("/settings/nova-poshta");
        setConfig(res.data ?? {});
        setApiKeyInput("");
      } catch (e) {
        setError(getUserFriendlyApiError(e, "Не вдалося завантажити налаштування Nova Poshta."));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, unknown> = {
        isEnabled: config.isEnabled ?? false,
        apiUrl: config.apiUrl?.trim() || undefined,
        apiTimeoutMs:
          config.apiTimeoutMs != null && Number(config.apiTimeoutMs) > 0
            ? Number(config.apiTimeoutMs)
            : undefined,
        senderCityRef: config.senderCityRef?.trim() || undefined,
        senderWarehouseRef: config.senderWarehouseRef?.trim() || undefined,
        senderCounterpartyRef: config.senderCounterpartyRef?.trim() || undefined,
        senderContactRef: config.senderContactRef?.trim() || undefined,
        senderPhone: config.senderPhone?.trim() || undefined,
        defaultPayerType: config.defaultPayerType?.trim() || undefined,
        defaultPaymentMethod: config.defaultPaymentMethod?.trim() || undefined,
      };
      if (clearStoredApiKey) body.apiKey = "";
      else if (apiKeyInput.trim()) body.apiKey = apiKeyInput.trim();
      const res = await apiHttp.patch<NovaPoshtaSettings>("/settings/nova-poshta", body);
      setConfig(res.data ?? {});
      setApiKeyInput("");
      setClearStoredApiKey(false);
      setSuccess("Збережено.");
    } catch (e) {
      setError(getUserFriendlyApiError(e, "Не вдалося зберегти."));
    } finally {
      setSaving(false);
    }
  };

  if (loading || !config) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <p className="text-sm text-zinc-500">{loading ? "Завантаження…" : "—"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">Nova Poshta</h1>
        <p className="mt-1 text-sm text-zinc-600">
          Ключ API, відправник і дефолти для ТТН. Якщо поле порожнє тут — використовується змінна оточення
          (див. документацію деплою).
        </p>
      </div>

      {error ? <ErrorPanel message={error} /> : null}
      {success ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!config.isEnabled}
          onChange={(e) => setConfig({ ...config, isEnabled: e.target.checked })}
        />
        Увімкнути інтеграцію (позначка для обліку; доступ керується ліцензією модулів)
      </label>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-zinc-800">API</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-600">API key (приховано)</label>
            <p className="text-xs text-zinc-500">
              Збережено: {config.apiKeyMasked ? config.apiKeyMasked : "немає — потрібен NP_API_KEY або введіть ключ"}
            </p>
            <input
              type="password"
              autoComplete="off"
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              placeholder="Новий ключ (залиште порожнім, щоб не змінювати)"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={clearStoredApiKey}
                onChange={(e) => setClearStoredApiKey(e.target.checked)}
              />
              Прибрати збережений ключ з CRM (тоді використовується лише NP_API_KEY у середовищі)
            </label>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-600">API URL (необов&apos;язково)</label>
            <input
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              placeholder="https://api.novaposhta.ua/v2.0/json/"
              value={config.apiUrl ?? ""}
              onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Таймаут (мс)</label>
            <input
              type="number"
              min={1000}
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              value={config.apiTimeoutMs ?? ""}
              onChange={(e) =>
                setConfig({
                  ...config,
                  apiTimeoutMs: e.target.value ? Number(e.target.value) : undefined,
                })
              }
            />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-zinc-800">Відправник (refs Нової Пошти)</h2>
        <p className="text-xs text-zinc-500">
          Після зміни збережіть і переконайтесь, що довідники синхронізовані (POST /np/sync у CRM).
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["senderCityRef", "CityRef"],
              ["senderWarehouseRef", "WarehouseRef"],
              ["senderCounterpartyRef", "CounterpartyRef"],
              ["senderContactRef", "ContactRef"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="sm:col-span-1">
              <label className="block text-xs font-medium text-zinc-600">{label}</label>
              <input
                className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm font-mono"
                value={(config[key] as string) ?? ""}
                onChange={(e) => setConfig({ ...config, [key]: e.target.value })}
              />
            </div>
          ))}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-600">Телефон відправника</label>
            <input
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              value={config.senderPhone ?? ""}
              onChange={(e) => setConfig({ ...config, senderPhone: e.target.value })}
            />
          </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-medium text-zinc-800">За замовчуванням для ТТН</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-600">Платник (Recipient / Sender)</label>
            <input
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              value={config.defaultPayerType ?? ""}
              onChange={(e) => setConfig({ ...config, defaultPayerType: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Оплата (Cash / …)</label>
            <input
              className="mt-1 w-full rounded border border-zinc-300 px-2 py-1.5 text-sm"
              value={config.defaultPaymentMethod ?? ""}
              onChange={(e) => setConfig({ ...config, defaultPaymentMethod: e.target.value })}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-md bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
        >
          {saving ? "Збереження…" : "Зберегти"}
        </button>
      </div>
    </div>
  );
}
