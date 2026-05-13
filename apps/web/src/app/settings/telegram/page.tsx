"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { ErrorPanel, PageLoading } from "@/components/feedback";

type TelegramConfig = {
  botTokenMasked?: string;
  webhookSecretMasked?: string;
  publicBaseUrl?: string;
  leadCompanyId?: string;
  aiEnabled?: boolean;
  aiOpenaiApiKeyMasked?: string;
  aiModel?: string;
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
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiOpenaiApiKey, setAiOpenaiApiKey] = useState("");
  const [aiModel, setAiModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [linkBotUsername, setLinkBotUsername] = useState<string>("");
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<TelegramConfig>("/settings/telegram");
      const data = res.data ?? {};
      setConfig(data);
      setBotToken("");
      setWebhookSecret("");
      setPublicBaseUrl(data.publicBaseUrl ?? "");
      setLeadCompanyId(data.leadCompanyId ?? "");
      setAiEnabled(data.aiEnabled ?? false);
      setAiOpenaiApiKey("");
      setAiModel(data.aiModel ?? "");
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
      const body: Record<string, string | boolean> = {
        publicBaseUrl: publicBaseUrl.trim(),
        leadCompanyId: leadCompanyId.trim(),
        aiEnabled,
        aiModel: aiModel.trim(),
      };
      if (botToken !== "") body.botToken = botToken;
      if (webhookSecret !== "") body.webhookSecret = webhookSecret;
      if (aiOpenaiApiKey !== "") body.aiOpenaiApiKey = aiOpenaiApiKey;
      const res = await apiHttp.patch<TelegramConfig>("/settings/telegram", body);
      const data = res.data ?? {};
      setConfig(data);
      setBotToken("");
      setWebhookSecret("");
      setAiOpenaiApiKey("");
      setPublicBaseUrl(data.publicBaseUrl ?? publicBaseUrl);
      setLeadCompanyId(data.leadCompanyId ?? leadCompanyId);
      setAiEnabled(data.aiEnabled ?? aiEnabled);
      setAiModel(data.aiModel ?? aiModel);
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

  const webhookUrl =
    (publicBaseUrl || config.publicBaseUrl || "").replace(/\/+$/, "") +
    "/integrations/telegram/webhook";

  return (
    <SettingsPageShell
      maxWidthClassName="max-w-xl"
      title="Telegram Inbox"
      subtitle="Bot token, webhook secret and public URL for receiving messages. Use the same secret in setWebhook and request header."
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
              {saving ? "Saving…" : "Save"}
            </button>
          </div>

          <div className="mt-8 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-zinc-800">
              Подключить Telegram для входа в CRM
            </h3>
            <p className="mt-1 text-xs text-zinc-500">
              После привязки можно входить через виджет «Вход через Telegram» на странице входа и
              получать коды сброса пароля в Telegram.
            </p>
            {linkError && <p className="mt-2 text-sm text-red-600">{linkError}</p>}
            {linkToken ? (
              <div className="mt-3 rounded bg-zinc-100 p-3 text-sm">
                <p className="text-zinc-700">Отправьте боту {linkBotUsername} команду:</p>
                <p className="mt-1 font-mono text-zinc-900">/link {linkToken}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  Ссылка действует 10 минут. После отправки команды Telegram будет привязан к вашему
                  аккаунту.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void requestTelegramLink()}
                disabled={linkLoading}
                className="mt-3 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
              >
                {linkLoading ? "Запрос…" : "Получить ссылку для привязки"}
              </button>
            )}
          </div>
        </div>
      )}
    </SettingsPageShell>
  );
}
