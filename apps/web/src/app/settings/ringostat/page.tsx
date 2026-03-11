"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type RingostatConfig = {
  isEnabled?: boolean;
  useWebhook?: boolean;
  usePolling?: boolean;
  pollingLookbackMinutes?: number;
  projectId?: string;
  extensionsToUserId?: Record<string, string>;
  defaultManagerId?: string;
  apiBaseUrl?: string;
  pollingEndpoint?: string;
  publicBaseUrl?: string;
  webhookSecretMasked?: string;
  apiTokenMasked?: string;
};

export default function RingostatSettingsPage() {
  const [config, setConfig] = useState<RingostatConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [extensions, setExtensions] = useState<Array<{ extension: string; userId: string }>>([]);
  const [apiTokenValue, setApiTokenValue] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiHttp.get<RingostatConfig & { webhookSecretMasked?: string; apiTokenMasked?: string }>(
          "/settings/ringostat",
        );
        const data = res.data ?? {};
        setConfig(data);
        setPublicBaseUrl(data.publicBaseUrl ?? "");
        const ext = data.extensionsToUserId ?? {};
        setExtensions(Object.entries(ext).map(([extension, userId]) => ({ extension, userId })));
      } catch (e) {
        const msg =
          (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
          (e instanceof Error ? e.message : "Failed to load Ringostat settings");
        setError(msg);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const handleToggle = (key: "isEnabled" | "useWebhook" | "usePolling") => {
    setConfig((prev) => ({
      ...(prev ?? {}),
      [key]: !prev?.[key],
    }));
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const extensionsToUserId: Record<string, string> = {};
      for (const row of extensions) {
        const ext = row.extension.trim();
        const userId = row.userId.trim();
        if (!ext || !userId) continue;
        extensionsToUserId[ext] = userId;
      }

      const payload: Record<string, unknown> = {
        isEnabled: config.isEnabled ?? false,
        useWebhook: config.useWebhook ?? true,
        usePolling: config.usePolling ?? false,
        pollingLookbackMinutes: config.pollingLookbackMinutes ?? 10,
        projectId: config.projectId ?? undefined,
        apiBaseUrl: config.apiBaseUrl ?? undefined,
        pollingEndpoint: config.pollingEndpoint ?? undefined,
        extensionsToUserId,
        defaultManagerId: config.defaultManagerId ?? undefined,
      };
      if (apiTokenValue.trim() !== "") payload.apiToken = apiTokenValue.trim();
      if (webhookSecret.trim() !== "") payload.webhookSecret = webhookSecret.trim();
      payload.publicBaseUrl = publicBaseUrl.trim() || undefined;

      const res = await apiHttp.patch<RingostatConfig & { webhookSecretMasked?: string; apiTokenMasked?: string }>(
        "/settings/ringostat",
        payload,
      );
      setConfig(res.data);
      setApiTokenValue("");
      setWebhookSecret("");
      setPublicBaseUrl(res.data.publicBaseUrl ?? publicBaseUrl);
      const ext = res.data.extensionsToUserId ?? {};
      setExtensions(Object.entries(ext).map(([extension, userId]) => ({ extension, userId })));
      setSuccess("Настройки Ringostat сохранены");
    } catch (e) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (e instanceof Error ? e.message : "Failed to save Ringostat settings");
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const updateExtension = (index: number, field: "extension" | "userId", value: string) => {
    setExtensions((prev) =>
      prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)),
    );
  };

  const addExtensionRow = () => {
    setExtensions((prev) => [...prev, { extension: "", userId: "" }]);
  };

  const removeExtensionRow = (index: number) => {
    setExtensions((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Ringostat integration</h1>
          <p className="text-sm text-zinc-500">
            Настройки телефонии Ringostat: включение, режимы webhook/polling и маппинг внутренних
            линий на пользователей CRM.
          </p>
        </div>

        {loading ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
            Загрузка настроек…
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
                  <div className="text-sm font-semibold text-zinc-900">
                    Включить интеграцию Ringostat
                  </div>
                  <div className="text-xs text-zinc-500">
                    При выключенной интеграции вебхуки и polling будут игнорироваться.
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleToggle("isEnabled")}
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

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="flex items-center justify-between gap-2 text-sm font-medium text-zinc-900">
                    <span>Webhook</span>
                    <button
                      type="button"
                      onClick={() => handleToggle("useWebhook")}
                      className={`inline-flex h-6 w-11 items-center rounded-full border transition ${
                        config?.useWebhook ?? true
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-zinc-300 bg-zinc-100"
                      }`}
                    >
                      <span
                        className={`ml-1 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          config?.useWebhook ?? true ? "translate-x-4" : ""
                        }`}
                      />
                    </button>
                  </label>
                  <p className="text-xs text-zinc-500">
                    При включенном режиме ожидается POST запрос на <code>/integrations/ringostat/webhook</code>.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center justify-between gap-2 text-sm font-medium text-zinc-900">
                    <span>Polling (резервный источник)</span>
                    <button
                      type="button"
                      onClick={() => handleToggle("usePolling")}
                      className={`inline-flex h-6 w-11 items-center rounded-full border transition ${
                        config?.usePolling
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-zinc-300 bg-zinc-100"
                      }`}
                    >
                      <span
                        className={`ml-1 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          config?.usePolling ? "translate-x-4" : ""
                        }`}
                      />
                    </button>
                  </label>
                  <p className="text-xs text-zinc-500">
                    При включении система будет периодически опрашивать Ringostat API для подтягивания
                    звонков и записей.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    Webhook secret
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder={
                      config?.webhookSecretMasked
                        ? "•••••••• — введите новый для смены"
                        : "Тот же секрет укажите в ЛК Ringostat в настройках вебхука"
                    }
                  />
                  <p className="text-xs text-zinc-500">
                    Заголовок в ЛК Ringostat: X-Ringostat-Webhook-Secret
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    Public base URL (для ngrok)
                  </label>
                  <input
                    type="url"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={publicBaseUrl}
                    onChange={(e) => setPublicBaseUrl(e.target.value)}
                    placeholder="https://xxxx.ngrok-free.app"
                  />
                  <p className="text-xs text-zinc-500">
                    URL бэкенда для вебхука. Скопируйте Webhook URL ниже в ЛК Ringostat.
                  </p>
                </div>
              </div>
              {(publicBaseUrl || config?.publicBaseUrl) && (
                <div className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600 break-all">
                  Webhook URL:{" "}
                  {(publicBaseUrl || config?.publicBaseUrl || "").replace(/\/+$/, "")}
                  /integrations/ringostat/webhook
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    API Token (Auth key)
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={apiTokenValue}
                    onChange={(e) => setApiTokenValue(e.target.value)}
                    placeholder={
                      config?.apiTokenMasked ? "•••••••• — введите новый для смены" : "Ключ из Ringostat → Интеграции → Ringostat API"
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    Project ID
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={config?.projectId ?? ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...(prev ?? {}),
                        projectId: e.target.value || undefined,
                      }))
                    }
                    placeholder="ID проекта из Ringostat"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    Окно polling, минут
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={60}
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={config?.pollingLookbackMinutes ?? 10}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...(prev ?? {}),
                        pollingLookbackMinutes: Number(e.target.value) || 10,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    API base URL (опционально)
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={config?.apiBaseUrl ?? ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...(prev ?? {}),
                        apiBaseUrl: e.target.value || undefined,
                      }))
                    }
                    placeholder="https://api.ringostat.net"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    Polling endpoint (опционально)
                  </label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={config?.pollingEndpoint ?? ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...(prev ?? {}),
                        pollingEndpoint: e.target.value || undefined,
                      }))
                    }
                    placeholder="/calls"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">
                Маппинг внутренних линий → пользователи CRM
              </h2>
              <p className="text-xs text-zinc-500">
                Используется для определения ответственного менеджера по данным Ringostat
                (extension / user / line).
              </p>

              <div className="overflow-hidden rounded-md border border-zinc-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs font-medium uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Extension</th>
                      <th className="px-3 py-2">User ID</th>
                      <th className="w-12 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {extensions.length === 0 ? (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-3 text-xs text-zinc-500"
                        >
                          Пока нет ни одной записи. Добавьте соответствие extension → userId.
                        </td>
                      </tr>
                    ) : (
                      extensions.map((row, idx) => (
                        <tr key={`${row.extension}-${idx}`}>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                              value={row.extension}
                              onChange={(e) =>
                                updateExtension(idx, "extension", e.target.value)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                              value={row.userId}
                              onChange={(e) =>
                                updateExtension(idx, "userId", e.target.value)
                              }
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeExtensionRow(idx)}
                              className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50"
                            >
                              Удалить
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={addExtensionRow}
                className="rounded-md border border-dashed border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
              >
                + Добавить extension
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
              >
                {saving ? "Сохранение…" : "Сохранить"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

