"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type OutboundVoiceConfig = {
  isEnabled?: boolean;
  apiBaseUrl?: string;
  providerDisplayName?: string;
  createCallPath?: string;
  responseSessionIdKeys?: string[];
  webhookSecretMasked?: string;
  apiTokenMasked?: string;
};

function getApiErrorMessage(e: unknown, fallback: string) {
  const msg =
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      ?.message ??
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error;
  return msg ?? (e instanceof Error ? e.message : fallback);
}

function keysToText(keys: string[] | undefined) {
  if (!keys?.length) return "";
  return keys.join(", ");
}

function textToKeys(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function OutboundVoiceSettingsPage() {
  const [config, setConfig] = useState<OutboundVoiceConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [providerDisplayName, setProviderDisplayName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [createCallPath, setCreateCallPath] = useState("");
  const [responseKeysText, setResponseKeysText] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [clearApiToken, setClearApiToken] = useState(false);
  const [clearWebhookSecret, setClearWebhookSecret] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<OutboundVoiceConfig>("/settings/outbound-voice");
      const data = res.data ?? {};
      setConfig(data);
      setProviderDisplayName(data.providerDisplayName ?? "");
      setApiBaseUrl(data.apiBaseUrl ?? "");
      setCreateCallPath(data.createCallPath ?? "");
      setResponseKeysText(keysToText(data.responseSessionIdKeys));
      setApiToken("");
      setWebhookSecret("");
      setClearApiToken(false);
      setClearWebhookSecret(false);
    } catch (e) {
      setError(getApiErrorMessage(e, "Не удалось загрузить настройки"));
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
    setSuccess(null);
    try {
      const keys = textToKeys(responseKeysText);
      const body: Record<string, unknown> = {
        isEnabled: config?.isEnabled ?? false,
        providerDisplayName: providerDisplayName.trim() || undefined,
        apiBaseUrl: apiBaseUrl.trim() || undefined,
        createCallPath: createCallPath.trim() || undefined,
        responseSessionIdKeys: keys.length > 0 ? keys : [],
      };
      if (clearApiToken) body.apiToken = "";
      else if (apiToken.trim() !== "") body.apiToken = apiToken.trim();
      if (clearWebhookSecret) body.webhookSecret = "";
      else if (webhookSecret.trim() !== "") body.webhookSecret = webhookSecret.trim();

      const res = await apiHttp.patch<OutboundVoiceConfig>("/settings/outbound-voice", body);
      const data = res.data ?? {};
      setConfig(data);
      setProviderDisplayName(data.providerDisplayName ?? "");
      setApiBaseUrl(data.apiBaseUrl ?? "");
      setCreateCallPath(data.createCallPath ?? "");
      setResponseKeysText(keysToText(data.responseSessionIdKeys));
      setApiToken("");
      setWebhookSecret("");
      setClearApiToken(false);
      setClearWebhookSecret(false);
      setSuccess("Настройки Outbound voice сохранены");
    } catch (e) {
      setError(getApiErrorMessage(e, "Не удалось сохранить"));
    } finally {
      setSaving(false);
    }
  }

  const configured =
    Boolean(config?.apiBaseUrl?.trim()) &&
    (config?.apiTokenMasked && config.apiTokenMasked.length > 0);

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/settings"
              className="mb-2 inline-block text-sm text-zinc-500 hover:text-zinc-800"
            >
              ← Settings
            </Link>
            <h1 className="text-2xl font-bold text-zinc-900">Outbound voice (AI Calls)</h1>
            <p className="mt-1 text-sm text-zinc-500">
              HTTP-провайдер исходящих звонков и секрет вебхука для событий после звонка. Сценарии
              и кампании настраиваются в разделе{" "}
              <Link href="/outbound/campaigns" className="text-blue-600 hover:underline">
                AI Calls
              </Link>
              .
            </p>
          </div>
          <div
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              configured
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-zinc-200 bg-zinc-100 text-zinc-600"
            }`}
          >
            {configured ? "Провайдер настроен" : "Провайдер не настроен"}
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
            Загрузка…
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                {success}
              </div>
            )}

            <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Включить интеграцию</div>
                  <div className="text-xs text-zinc-500">
                    При выключении вебхук и исходящие вызовы через провайдера не используются.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setConfig((prev) => ({
                      ...(prev ?? {}),
                      isEnabled: !prev?.isEnabled,
                    }))
                  }
                  className={`inline-flex h-7 w-12 items-center rounded-full border transition ${
                    config?.isEnabled
                      ? "border-emerald-500 bg-emerald-500"
                      : "border-zinc-300 bg-zinc-100"
                  }`}
                >
                  <span
                    className={`ml-1 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                      config?.isEnabled ? "translate-x-4" : ""
                    }`}
                  />
                </button>
              </div>

              <div className="border-t border-zinc-100 pt-4">
                <label className="block text-sm font-medium text-zinc-900">
                  Отображаемое имя провайдера
                </label>
                <p className="mb-1 text-xs text-zinc-500">Для справки в команде (необязательно).</p>
                <input
                  type="text"
                  value={providerDisplayName}
                  onChange={(e) => setProviderDisplayName(e.target.value)}
                  placeholder="Например, Acme Voice"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                />
              </div>

              <div className="border-t border-zinc-100 pt-4">
                <label className="block text-sm font-medium text-zinc-900">Базовый URL API провайдера</label>
                <p className="mb-1 text-xs text-zinc-500">
                  Без завершающего слэша. К нему добавляется путь создания звонка (ниже).
                </p>
                <input
                  type="url"
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder="https://voice-provider.example.com/v1"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900">Путь создания звонка</label>
                <p className="mb-1 text-xs text-zinc-500">
                  Относительный путь от базового URL. Пусто = по умолчанию{" "}
                  <code className="rounded bg-zinc-100 px-1">/calls</code>.
                </p>
                <input
                  type="text"
                  value={createCallPath}
                  onChange={(e) => setCreateCallPath(e.target.value)}
                  placeholder="/calls"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Bearer token провайдера
                </label>
                <p className="mb-1 text-xs text-zinc-500">
                  Сохранённый токен:{" "}
                  <span className="font-mono text-zinc-700">
                    {config?.apiTokenMasked || "—"}
                  </span>
                  . Введите новое значение, чтобы заменить.
                </p>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={apiToken}
                  onChange={(e) => {
                    setApiToken(e.target.value);
                    setClearApiToken(false);
                  }}
                  disabled={clearApiToken}
                  placeholder="Оставьте пустым, если не меняете"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:bg-zinc-100"
                />
                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={clearApiToken}
                    onChange={(e) => {
                      setClearApiToken(e.target.checked);
                      if (e.target.checked) setApiToken("");
                    }}
                    className="rounded border-zinc-300"
                  />
                  Удалить сохранённый токен
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Ключи ответа для session / call id
                </label>
                <p className="mb-1 text-xs text-zinc-500">
                  Имена полей в JSON-ответе провайдера после POST создания звонка. Через запятую или с
                  новой строки. Пусто на бэкенде подставит значения по умолчанию (
                  <code className="rounded bg-zinc-100 px-1 text-[11px]">id, call_id, session_id…</code>
                  ).
                </p>
                <textarea
                  value={responseKeysText}
                  onChange={(e) => setResponseKeysText(e.target.value)}
                  rows={3}
                  placeholder="id, session_id"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 font-mono text-sm"
                />
              </div>

              <div className="border-t border-zinc-100 pt-4">
                <label className="block text-sm font-medium text-zinc-900">Секрет вебхука</label>
                <p className="mb-1 text-xs text-zinc-500">
                  Заголовок <code className="rounded bg-zinc-100 px-1">x-outbound-voice-secret</code> при
                  POST на CRM. Текущее значение:{" "}
                  <span className="font-mono text-zinc-700">
                    {config?.webhookSecretMasked || "—"}
                  </span>
                  .
                </p>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={webhookSecret}
                  onChange={(e) => {
                    setWebhookSecret(e.target.value);
                    setClearWebhookSecret(false);
                  }}
                  disabled={clearWebhookSecret}
                  placeholder="Новый секрет или пусто"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm disabled:bg-zinc-100"
                />
                <label className="mt-2 flex items-center gap-2 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={clearWebhookSecret}
                    onChange={(e) => {
                      setClearWebhookSecret(e.target.checked);
                      if (e.target.checked) setWebhookSecret("");
                    }}
                    className="rounded border-zinc-300"
                  />
                  Удалить сохранённый секрет вебхука
                </label>
              </div>

              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
            </div>

            <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-5 text-sm text-zinc-800">
              <h2 className="mb-2 font-semibold text-zinc-900">Вебхук в CRM (для провайдера)</h2>
              <p className="mb-2 text-zinc-600">
                URL:{" "}
                <code className="break-all rounded bg-white px-1.5 py-0.5 text-xs text-zinc-800">
                  {"{BASE_URL_БЭКЕНДА}"}/integrations/outbound-voice/webhook
                </code>
              </p>
              <ul className="list-inside list-disc space-y-1 text-zinc-600">
                <li>
                  Заголовок: <code className="rounded bg-white px-1">x-outbound-voice-secret</code> =
                  тот же секрет, что выше.
                </li>
                <li>
                  В теле можно передавать <code className="rounded bg-white px-1">externalCallId</code>{" "}
                  и при необходимости <code className="rounded bg-white px-1">callProvider</code> для
                  привязки к записи Call в CRM.
                </li>
                <li>
                  Пост-анализ транскрипта использует OpenAI (тот же ключ, что для Telegram Inbox AI,
                  или переменная окружения на сервере).
                </li>
                <li>
                  Для очереди обзвона и догонки линковки Call на сервере должно быть{" "}
                  <code className="rounded bg-white px-1">CRON_ENABLED=true</code>.
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
