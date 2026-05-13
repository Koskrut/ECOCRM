"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { strings } from "@/locales";
import { ErrorPanel } from "@/components/feedback";

type OutboundVoiceRuntimeMode = "stub" | "generic_http" | "kyivstar_openai_gateway";

type OutboundVoiceConfig = {
  isEnabled?: boolean;
  apiBaseUrl?: string;
  providerDisplayName?: string;
  createCallPath?: string;
  responseSessionIdKeys?: string[];
  runtimeMode?: OutboundVoiceRuntimeMode;
  gatewayCreateCallPath?: string;
  publicWebhookBaseUrl?: string;
  requestTimeoutMs?: number;
  retryMax?: number;
  webhookSecretMasked?: string;
  apiTokenMasked?: string;
};

function getApiErrorMessage(e: unknown, fallback: string) {
  return getUserFriendlyApiError(e, fallback);
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

  const [runtimeMode, setRuntimeMode] = useState<"" | OutboundVoiceRuntimeMode>("");
  const [gatewayCreateCallPath, setGatewayCreateCallPath] = useState("");
  const [publicWebhookBaseUrl, setPublicWebhookBaseUrl] = useState("");
  const [requestTimeoutMs, setRequestTimeoutMs] = useState<number>(30_000);
  const [retryMax, setRetryMax] = useState<number>(0);

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
      setRuntimeMode(
        data.runtimeMode === "stub" ||
          data.runtimeMode === "generic_http" ||
          data.runtimeMode === "kyivstar_openai_gateway"
          ? data.runtimeMode
          : "",
      );
      setGatewayCreateCallPath(data.gatewayCreateCallPath ?? "");
      setPublicWebhookBaseUrl(data.publicWebhookBaseUrl ?? "");
      setRequestTimeoutMs(
        typeof data.requestTimeoutMs === "number" ? data.requestTimeoutMs : 30_000,
      );
      setRetryMax(typeof data.retryMax === "number" ? data.retryMax : 0);
      setApiToken("");
      setWebhookSecret("");
      setClearApiToken(false);
      setClearWebhookSecret(false);
    } catch (e) {
      setError(getApiErrorMessage(e, "Не вдалося завантажити налаштування."));
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
        runtimeMode:
          runtimeMode === ""
            ? null
            : runtimeMode === "stub" ||
                runtimeMode === "generic_http" ||
                runtimeMode === "kyivstar_openai_gateway"
              ? runtimeMode
              : undefined,
        gatewayCreateCallPath: gatewayCreateCallPath.trim() || undefined,
        publicWebhookBaseUrl: publicWebhookBaseUrl.trim() || undefined,
        requestTimeoutMs: Number.isFinite(requestTimeoutMs) ? requestTimeoutMs : 30_000,
        retryMax: Number.isFinite(retryMax) ? retryMax : 0,
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
      setRuntimeMode(
        data.runtimeMode === "stub" ||
          data.runtimeMode === "generic_http" ||
          data.runtimeMode === "kyivstar_openai_gateway"
          ? data.runtimeMode
          : "",
      );
      setGatewayCreateCallPath(data.gatewayCreateCallPath ?? "");
      setPublicWebhookBaseUrl(data.publicWebhookBaseUrl ?? "");
      setRequestTimeoutMs(
        typeof data.requestTimeoutMs === "number" ? data.requestTimeoutMs : 30_000,
      );
      setRetryMax(typeof data.retryMax === "number" ? data.retryMax : 0);
      setApiToken("");
      setWebhookSecret("");
      setClearApiToken(false);
      setClearWebhookSecret(false);
      setSuccess("Налаштування Outbound voice збережено.");
    } catch (e) {
      setError(getApiErrorMessage(e, "Не вдалося зберегти налаштування."));
    } finally {
      setSaving(false);
    }
  }

  const configured =
    Boolean(config?.apiBaseUrl?.trim()) &&
    config?.apiTokenMasked &&
    config.apiTokenMasked.length > 0;

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href="/settings"
              className="mb-2 inline-block text-sm text-zinc-500 hover:text-zinc-800"
            >
              ← {strings.common.backToSettings}
            </Link>
            <h1 className="text-2xl font-bold text-zinc-900">Outbound voice (AI Calls)</h1>
            <p className="mt-1 text-sm text-zinc-500">
              HTTP-провайдер вихідних дзвінків і секрет вебхука для подій після дзвінка. Сценарії та
              кампанії налаштовуються в розділі{" "}
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
            {configured ? "Провайдер налаштований" : "Провайдер не налаштований"}
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
            Завантаження...
          </div>
        ) : (
          <>
            {error ? <ErrorPanel variant="inline" message={error} /> : null}
            {success && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                {success}
              </div>
            )}

            <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Увімкнути інтеграцію</div>
                  <div className="text-xs text-zinc-500">
                    Коли вимкнено, вебхук і вихідні виклики через провайдера не використовуються.
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
                <label className="block text-sm font-medium text-zinc-900">Режим runtime</label>
                <p className="mb-1 text-xs text-zinc-500">
                  Порожньо = попередня логіка: якщо є URL і токен → generic HTTP, інакше stub.{" "}
                  <code className="rounded bg-zinc-100 px-1">kyivstar_openai_gateway</code> —
                  отдельный путь создания вызова для шлюза Kyivstar/OpenAI.
                </p>
                <select
                  value={runtimeMode}
                  onChange={(e) => setRuntimeMode(e.target.value as "" | OutboundVoiceRuntimeMode)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                >
                  <option value="">(авто / legacy)</option>
                  <option value="stub">stub</option>
                  <option value="generic_http">generic_http</option>
                  <option value="kyivstar_openai_gateway">kyivstar_openai_gateway</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Путь для gateway (Kyivstar/OpenAI)
                </label>
                <p className="mb-1 text-xs text-zinc-500">
                  Относительный путь от базового URL для режима{" "}
                  <code className="rounded bg-zinc-100 px-1">kyivstar_openai_gateway</code>. Пусто ={" "}
                  <code className="rounded bg-zinc-100 px-1">/v1/outbound/calls</code>.
                </p>
                <input
                  type="text"
                  value={gatewayCreateCallPath}
                  onChange={(e) => setGatewayCreateCallPath(e.target.value)}
                  placeholder="/v1/outbound/calls"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Публичный URL API CRM (callback)
                </label>
                <p className="mb-1 text-xs text-zinc-500">
                  Без завершающего слэша. Уходит в теле create-call как{" "}
                  <code className="rounded bg-zinc-100 px-1">callback.webhookUrl</code> для шлюза.
                  Можно задать через{" "}
                  <code className="rounded bg-zinc-100 px-1">OUTBOUND_VOICE_PUBLIC_BASE_URL</code>{" "}
                  на сервере.
                </p>
                <input
                  type="url"
                  value={publicWebhookBaseUrl}
                  onChange={(e) => setPublicWebhookBaseUrl(e.target.value)}
                  placeholder="https://api.crm.example.com"
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm font-mono"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-900">
                    Таймаут HTTP (мс)
                  </label>
                  <input
                    type="number"
                    min={1000}
                    step={1000}
                    value={requestTimeoutMs}
                    onChange={(e) => setRequestTimeoutMs(parseInt(e.target.value, 10) || 30_000)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-900">Retry max</label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={retryMax}
                    onChange={(e) => setRetryMax(parseInt(e.target.value, 10) || 0)}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="border-t border-zinc-100 pt-4">
                <label className="block text-sm font-medium text-zinc-900">
                  Базовый URL API провайдера
                </label>
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
                <label className="block text-sm font-medium text-zinc-900">
                  Путь создания звонка
                </label>
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
                  Збережений токен:{" "}
                  <span className="font-mono text-zinc-700">{config?.apiTokenMasked || "—"}</span>.
                  Введіть нове значення, щоб замінити.
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
                  Видалити збережений токен
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900">
                  Ключи ответа для session / call id
                </label>
                <p className="mb-1 text-xs text-zinc-500">
                  Имена полей в JSON-ответе провайдера после POST создания звонка. Через запятую или
                  с новой строки. Пусто на бэкенде подставит значения по умолчанию (
                  <code className="rounded bg-zinc-100 px-1 text-[11px]">
                    id, call_id, session_id…
                  </code>
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
                  Заголовок{" "}
                  <code className="rounded bg-zinc-100 px-1">x-outbound-voice-secret</code> при POST
                  на CRM. Текущее значение:{" "}
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
                  placeholder="Новий секрет або порожньо"
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
                  Видалити збережений секрет вебхука
                </label>
              </div>

              <button
                type="button"
                onClick={() => void save()}
                disabled={saving}
                className="rounded-xl bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {saving ? "Збереження..." : "Зберегти"}
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
                  Заголовок: <code className="rounded bg-white px-1">x-outbound-voice-secret</code>{" "}
                  = той самий секрет, що вище.
                </li>
                <li>
                  В теле можно передавать{" "}
                  <code className="rounded bg-white px-1">externalCallId</code> и при необходимости{" "}
                  <code className="rounded bg-white px-1">callProvider</code> для привязки к записи
                  Call в CRM.
                </li>
                <li>
                  Пост-аналіз транскрипту використовує OpenAI (той самий ключ, що для Telegram Inbox AI,
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
