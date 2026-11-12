"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { ErrorPanel, PageLoading } from "@/components/feedback";

type TelegramDailyWorkReportConfig = {
  enabled: boolean;
  time: string;
  weekdaysOnly: boolean;
  teamSummary: boolean;
};

type TelegramConfig = {
  botTokenMasked?: string;
  webhookSecretMasked?: string;
  publicBaseUrl?: string;
  leadCompanyId?: string;
  staffGroupChatId?: string;
  aiEnabled?: boolean;
  aiOpenaiApiKeyMasked?: string;
  aiModel?: string;
  dailyWorkReport?: TelegramDailyWorkReportConfig;
};

const DEFAULT_DAILY_WORK_REPORT: TelegramDailyWorkReportConfig = {
  enabled: true,
  time: "18:00",
  weekdaysOnly: true,
  teamSummary: true,
};

type WebhookInfo = {
  url: string;
  pendingUpdateCount: number;
  lastErrorDate?: number;
  lastErrorMessage?: string;
  allowedUpdates?: string[];
};

function getApiErrorMessage(e: unknown, fallback: string) {
  return getUserFriendlyApiError(e, fallback);
}

export default function TelegramSettingsPage() {
  const [config, setConfig] = useState<TelegramConfig>({});
  const [botToken, setBotToken] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [leadCompanyId, setLeadCompanyId] = useState("");
  const [staffGroupChatId, setStaffGroupChatId] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiOpenaiApiKey, setAiOpenaiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [dailyWorkReport, setDailyWorkReport] =
    useState<TelegramDailyWorkReportConfig>(DEFAULT_DAILY_WORK_REPORT);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkBotUsername, setLinkBotUsername] = useState<string>("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const [webhookBusy, setWebhookBusy] = useState(false);
  const [webhookMsg, setWebhookMsg] = useState<string | null>(null);
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null);
  const [publicStoreUrl, setPublicStoreUrl] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [tgRes, storeRes] = await Promise.all([
        apiHttp.get<TelegramConfig>("/settings/telegram"),
        apiHttp.get<{ publicStoreUrl?: string }>("/settings/store").catch(
          (): { data: { publicStoreUrl?: string } } => ({ data: {} }),
        ),
      ]);
      const data = tgRes.data ?? {};
      setConfig(data);
      setBotToken("");
      setWebhookSecret("");
      setPublicBaseUrl(data.publicBaseUrl ?? "");
      setLeadCompanyId(data.leadCompanyId ?? "");
      setStaffGroupChatId(data.staffGroupChatId ?? "");
      setAiEnabled(data.aiEnabled ?? false);
      setAiOpenaiApiKey("");
      setAiModel(data.aiModel ?? "");
      setDailyWorkReport({
        ...DEFAULT_DAILY_WORK_REPORT,
        ...(data.dailyWorkReport ?? {}),
      });
      setPublicStoreUrl(
        typeof storeRes.data?.publicStoreUrl === "string" ? storeRes.data.publicStoreUrl : "",
      );
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
    try {
      const body: Record<string, unknown> = {
        publicBaseUrl: publicBaseUrl.trim(),
        leadCompanyId: leadCompanyId.trim(),
        staffGroupChatId: staffGroupChatId.trim(),
        aiEnabled,
        aiModel: aiModel.trim(),
        dailyWorkReport: {
          enabled: dailyWorkReport.enabled,
          time: dailyWorkReport.time.trim() || DEFAULT_DAILY_WORK_REPORT.time,
          weekdaysOnly: dailyWorkReport.weekdaysOnly,
          teamSummary: dailyWorkReport.teamSummary,
        },
      };
      if (botToken !== "") body.botToken = botToken;
      if (webhookSecret !== "") body.webhookSecret = webhookSecret;
      if (aiOpenaiApiKey !== "") body.aiOpenaiApiKey = aiOpenaiApiKey;
      const [res, storeRes] = await Promise.all([
        apiHttp.patch<TelegramConfig>("/settings/telegram", body),
        apiHttp.patch<{ publicStoreUrl?: string }>("/settings/store", {
          publicStoreUrl: publicStoreUrl.trim(),
        }),
      ]);
      const data = res.data ?? {};
      setConfig(data);
      setBotToken("");
      setWebhookSecret("");
      setAiOpenaiApiKey("");
      setPublicBaseUrl(data.publicBaseUrl ?? publicBaseUrl);
      setLeadCompanyId(data.leadCompanyId ?? leadCompanyId);
      setStaffGroupChatId(data.staffGroupChatId ?? staffGroupChatId);
      setAiEnabled(data.aiEnabled ?? aiEnabled);
      setAiModel(data.aiModel ?? aiModel);
      setDailyWorkReport({
        ...DEFAULT_DAILY_WORK_REPORT,
        ...(data.dailyWorkReport ?? dailyWorkReport),
      });
      setPublicStoreUrl(
        typeof storeRes.data?.publicStoreUrl === "string"
          ? storeRes.data.publicStoreUrl
          : publicStoreUrl.trim(),
      );
    } catch (e) {
      setError(getApiErrorMessage(e, "Не вдалося зберегти налаштування."));
    } finally {
      setSaving(false);
    }
  }

  async function requestTelegramLink() {
    setLinkError(null);
    setLinkToken(null);
    setLinkLoading(true);
    try {
      const res = await apiHttp.post<{ token: string; botUsername: string }>(
        "/auth/telegram-link-request",
      );
      setLinkToken(res.data?.token ?? null);
      setLinkBotUsername(res.data?.botUsername ?? "бот");
    } catch (e) {
      setLinkError(getApiErrorMessage(e, "Не вдалося створити посилання для підключення."));
    } finally {
      setLinkLoading(false);
    }
  }

  async function registerWebhook() {
    setWebhookBusy(true);
    setWebhookMsg(null);
    try {
      const res = await apiHttp.post<{ ok: boolean; url: string }>(
        "/settings/telegram/register-webhook",
      );
      setWebhookMsg(`Webhook зареєстровано: ${res.data?.url ?? ""}`);
      await loadWebhookInfo();
    } catch (e) {
      setWebhookMsg(getApiErrorMessage(e, "Не вдалося зареєструвати webhook."));
    } finally {
      setWebhookBusy(false);
    }
  }

  async function loadWebhookInfo() {
    setWebhookBusy(true);
    setWebhookMsg(null);
    try {
      const res = await apiHttp.get<WebhookInfo>("/settings/telegram/webhook-info");
      setWebhookInfo(res.data ?? null);
    } catch (e) {
      setWebhookMsg(getApiErrorMessage(e, "Не вдалося отримати статус webhook."));
    } finally {
      setWebhookBusy(false);
    }
  }

  const webhookUrl =
    (publicBaseUrl || config.publicBaseUrl || "").replace(/\/+$/, "") +
    "/integrations/telegram/webhook";

  return (
    <SettingsPageShell
      maxWidthClassName="max-w-xl"
      title="Telegram"
      subtitle="Бот, webhook, щоденний підсумок менеджерам, компанія для лідів і каталог Mini App."
    >
      {error ? <ErrorPanel variant="inline" message={error} /> : null}
      {loading ? (
        <PageLoading inline />
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Bot Token</label>
              <p className="mt-0.5 text-xs text-zinc-500">
                From @BotFather. Leave empty to keep current.
              </p>
              <input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={
                  config.botTokenMasked ? `Current: ${config.botTokenMasked}` : "Paste token"
                }
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Webhook Secret</label>
              <p className="mt-0.5 text-xs text-zinc-500">
                Random string; set the same in setWebhook secret_token and in header
                X-Telegram-Bot-Api-Secret-Token.
              </p>
              <input
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={
                  config.webhookSecretMasked
                    ? `Current: ${config.webhookSecretMasked}`
                    : "e.g. my-webhook-secret"
                }
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Public base URL</label>
              <p className="mt-0.5 text-xs text-zinc-500">
                Backend URL for webhook (e.g. https://api.example.com). Used to build webhook URL.
              </p>
              <input
                type="url"
                value={publicBaseUrl}
                onChange={(e) => setPublicBaseUrl(e.target.value)}
                placeholder="https://your-backend.example.com"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>
            {webhookUrl && (
              <div className="rounded bg-zinc-100 px-3 py-2 text-xs text-zinc-600 break-all">
                Webhook URL: {webhookUrl}
              </div>
            )}
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void registerWebhook()}
                  disabled={webhookBusy}
                  className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                >
                  {webhookBusy ? "…" : "Register webhook"}
                </button>
                <button
                  type="button"
                  onClick={() => void loadWebhookInfo()}
                  disabled={webhookBusy}
                  className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50"
                >
                  Check status
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Registers the webhook in Telegram (setWebhook) with the secret token, then shows
                getWebhookInfo status. Save the token, secret and public URL first.
              </p>
              {webhookMsg && <p className="mt-2 text-xs text-zinc-700">{webhookMsg}</p>}
              {webhookInfo && (
                <dl className="mt-2 space-y-0.5 text-xs text-zinc-600">
                  <div className="break-all">
                    <span className="font-medium">URL:</span> {webhookInfo.url || "—"}
                  </div>
                  <div>
                    <span className="font-medium">Pending updates:</span>{" "}
                    {webhookInfo.pendingUpdateCount}
                  </div>
                  {webhookInfo.lastErrorMessage && (
                    <div className="text-red-600 break-all">
                      <span className="font-medium">Last error:</span>{" "}
                      {webhookInfo.lastErrorMessage}
                    </div>
                  )}
                </dl>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">
                Default company ID (optional)
              </label>
              <p className="mt-0.5 text-xs text-zinc-500">
                New leads from Telegram will be assigned to this company. Leave empty to use first
                company.
              </p>
              <input
                type="text"
                value={leadCompanyId}
                onChange={(e) => setLeadCompanyId(e.target.value)}
                placeholder="Company ID"
                className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <label className="block text-sm font-medium text-zinc-700">
                ID внутрішньої групи співробітників
              </label>
              <p className="mt-0.5 text-xs text-zinc-500">
                Chat id групи/супергрупи (наприклад <span className="font-mono">-100…</span>). Бот
                лишається лише в цій групі, читає повідомлення в Inbox і дублює CRM-сповіщення.
                Інші групи — виходить.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-zinc-500">
                <li>
                  @BotFather → Bot Settings → Group Privacy → <strong>Turn off</strong> (інакше бот
                  не бачить звичайний текст).
                </li>
                <li>Додайте бота в групу і зробіть адміністратором.</li>
                <li>
                  Після зміни privacy інколи треба прибрати й знову додати бота. Chat id зʼявиться в
                  логах webhook або можна взяти з будь-якого апдейту групи.
                </li>
                <li>Після збереження натисніть Register webhook (оновлює allowed_updates).</li>
              </ul>
              <input
                type="text"
                value={staffGroupChatId}
                onChange={(e) => setStaffGroupChatId(e.target.value)}
                placeholder="-1001234567890"
                className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 font-mono text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>
            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <label className="block text-sm font-medium text-zinc-700">
                URL вітрини для Mini App (HTTPS)
              </label>
              <p className="mt-0.5 text-xs text-zinc-500">
                Той самий публічний URL магазину, що в{" "}
                <Link href="/settings/store" className="text-zinc-800 underline underline-offset-2">
                  Налаштування → Інтернет-магазин
                </Link>
                . Якщо задано — кнопка «Каталог» у боті відкриває магазин у Telegram. Без URL
                лишається каталог кнопками в чаті.
              </p>
              <input
                type="url"
                value={publicStoreUrl}
                onChange={(e) => setPublicStoreUrl(e.target.value)}
                placeholder="https://shop.example.com"
                className="mt-2 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
              />
            </div>
          </div>

          <div className="mt-6 border-t border-zinc-200 pt-5">
            <h3 className="text-sm font-semibold text-zinc-800">
              Щоденний підсумок роботи менеджерам
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              Особисте повідомлення в Telegram менеджерам і керівникам з привʼязаним чатом
              (Europe/Kyiv). Керівникам — ще блок команди. Особисте вимкнення каналу — у{" "}
              <Link
                href="/settings/notifications"
                className="text-zinc-800 underline underline-offset-2"
              >
                Налаштування → Сповіщення
              </Link>
              .
            </p>
            <div className="mt-3 space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dailyWorkReport.enabled}
                  onChange={(e) =>
                    setDailyWorkReport((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                  className="rounded border-zinc-300"
                />
                <span className="text-sm text-zinc-700">Увімкнути щоденний підсумок</span>
              </label>
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Час відправки (Київ)
                </label>
                <input
                  type="time"
                  value={dailyWorkReport.time}
                  onChange={(e) =>
                    setDailyWorkReport((prev) => ({
                      ...prev,
                      time: e.target.value || DEFAULT_DAILY_WORK_REPORT.time,
                    }))
                  }
                  className="mt-1 w-40 rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dailyWorkReport.weekdaysOnly}
                  onChange={(e) =>
                    setDailyWorkReport((prev) => ({
                      ...prev,
                      weekdaysOnly: e.target.checked,
                    }))
                  }
                  className="rounded border-zinc-300"
                />
                <span className="text-sm text-zinc-700">Лише будні (пн–пт)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dailyWorkReport.teamSummary}
                  onChange={(e) =>
                    setDailyWorkReport((prev) => ({
                      ...prev,
                      teamSummary: e.target.checked,
                    }))
                  }
                  className="rounded border-zinc-300"
                />
                <span className="text-sm text-zinc-700">
                  Керівникам додавати підсумок команди
                </span>
              </label>
            </div>
          </div>

          <div className="mt-6 border-t border-zinc-200 pt-5">
            <h3 className="text-sm font-semibold text-zinc-800">AI — підказки відповідей</h3>
            <p className="mt-0.5 text-xs text-zinc-500">
              У інбоксі Telegram зʼявиться кнопка «Підказати відповідь»: AI запропонує варіанти
              відповіді за контекстом чату.
            </p>
            <div className="mt-3 space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={(e) => setAiEnabled(e.target.checked)}
                  className="rounded border-zinc-300"
                />
                <span className="text-sm text-zinc-700">Увімкнути AI-підказки</span>
              </label>
              <div>
                <label className="block text-sm font-medium text-zinc-700">OpenAI API key</label>
                <input
                  type="password"
                  value={aiOpenaiApiKey}
                  onChange={(e) => setAiOpenaiApiKey(e.target.value)}
                  placeholder={
                    config.aiOpenaiApiKeyMasked
                      ? `Поточний: ${config.aiOpenaiApiKeyMasked}`
                      : "sk-… (або задайте OPENAI_API_KEY в .env)"
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">Модель (optional)</label>
                <input
                  type="text"
                  value={aiModel}
                  onChange={(e) => setAiModel(e.target.value)}
                  placeholder="gpt-4o-mini"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
            </div>
          </div>
          <div className="mt-5 flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? "Збереження…" : "Зберегти"}
            </button>
          </div>

          <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-800">
              Підключити Telegram для входу в CRM
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              Після прив&apos;язки можна входити через віджет «Вхід через Telegram» на сторінці входу
              та отримувати коди для скидання пароля в Telegram.
            </p>
            {linkError && <p className="mt-2 text-sm text-red-600">{linkError}</p>}
            {linkToken ? (
              <div className="mt-3 rounded bg-zinc-100 p-3 text-sm">
                <p className="text-zinc-700">Надішліть боту {linkBotUsername} команду:</p>
                <p className="mt-1 font-mono text-zinc-900">/link {linkToken}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  Посилання діє 10 хвилин. Після надсилання команди Telegram буде прив&apos;язано до
                  вашого акаунта.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void requestTelegramLink()}
                disabled={linkLoading}
                className="mt-3 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {linkLoading ? "Запит…" : "Отримати посилання для прив'язки"}
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsPageShell>
  );
}
