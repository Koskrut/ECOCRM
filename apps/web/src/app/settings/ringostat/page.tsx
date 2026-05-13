"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { ErrorPanel } from "@/components/feedback";

function initialBackfillDates(): { from: string; to: string } {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  const to = `${y}-${pad(m + 1)}-${pad(d)}`;
  const first = new Date(Date.UTC(y, m, 1));
  const from = `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(first.getUTCDate())}`;
  return { from, to };
}

type RingostatConfig = {
  isEnabled?: boolean;
  useWebhook?: boolean;
  usePolling?: boolean;
  pollingLookbackMinutes?: number;
  projectId?: string;
  extensionsToUserId?: Record<string, string>;
  phonesToUserId?: Record<string, string>;
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
  const [phones, setPhones] = useState<Array<{ phone: string; userId: string }>>([]);
  const [apiTokenValue, setApiTokenValue] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [backfillFrom, setBackfillFrom] = useState(initialBackfillDates().from);
  const [backfillTo, setBackfillTo] = useState(initialBackfillDates().to);
  const [backfillBusy, setBackfillBusy] = useState(false);
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiHttp.get<
          RingostatConfig & { webhookSecretMasked?: string; apiTokenMasked?: string }
        >("/settings/ringostat");
        const data = res.data ?? {};
        setConfig(data);
        setPublicBaseUrl(data.publicBaseUrl ?? "");
        const ext = data.extensionsToUserId ?? {};
        setExtensions(Object.entries(ext).map(([extension, userId]) => ({ extension, userId })));
        const p = data.phonesToUserId ?? {};
        setPhones(Object.entries(p).map(([phone, userId]) => ({ phone, userId })));
      } catch (e) {
        setError(getUserFriendlyApiError(e, "Не вдалося завантажити налаштування Ringostat."));
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

      const phonesToUserId: Record<string, string> = {};
      for (const row of phones) {
        const phone = row.phone.trim();
        const userId = row.userId.trim();
        if (!phone || !userId) continue;
        phonesToUserId[phone] = userId;
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
        phonesToUserId,
        defaultManagerId: config.defaultManagerId ?? undefined,
      };
      if (apiTokenValue.trim() !== "") payload.apiToken = apiTokenValue.trim();
      if (webhookSecret.trim() !== "") payload.webhookSecret = webhookSecret.trim();
      payload.publicBaseUrl = publicBaseUrl.trim() || undefined;

      const res = await apiHttp.patch<
        RingostatConfig & { webhookSecretMasked?: string; apiTokenMasked?: string }
      >("/settings/ringostat", payload);
      setConfig(res.data);
      setApiTokenValue("");
      setWebhookSecret("");
      setPublicBaseUrl(res.data.publicBaseUrl ?? publicBaseUrl);
      const ext = res.data.extensionsToUserId ?? {};
      setExtensions(Object.entries(ext).map(([extension, userId]) => ({ extension, userId })));
      const p = res.data.phonesToUserId ?? {};
      setPhones(Object.entries(p).map(([phone, userId]) => ({ phone, userId })));
      setSuccess("Налаштування Ringostat збережено.");
    } catch (e) {
      setError(getUserFriendlyApiError(e, "Не вдалося зберегти налаштування Ringostat."));
    } finally {
      setSaving(false);
    }
  };

  const updateExtension = (index: number, field: "extension" | "userId", value: string) => {
    setExtensions((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addExtensionRow = () => {
    setExtensions((prev) => [...prev, { extension: "", userId: "" }]);
  };

  const removeExtensionRow = (index: number) => {
    setExtensions((prev) => prev.filter((_, i) => i !== index));
  };

  const updatePhone = (index: number, field: "phone" | "userId", value: string) => {
    setPhones((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const addPhoneRow = () => {
    setPhones((prev) => [...prev, { phone: "", userId: "" }]);
  };

  const removePhoneRow = (index: number) => {
    setPhones((prev) => prev.filter((_, i) => i !== index));
  };

  const runBackfill = async () => {
    setBackfillBusy(true);
    setBackfillMsg(null);
    setError(null);
    try {
      const fromIso = `${backfillFrom}T00:00:00.000Z`;
      const toIso = `${backfillTo}T23:59:59.999Z`;
      const r = await apiHttp.post<{
        chunks: number;
        totalEvents: number;
        from: string;
        to: string;
      }>("/settings/ringostat/backfill", { from: fromIso, to: toIso }, { timeout: 600_000 });
      const data = r.data;
      setBackfillMsg(
        `Готово: API-запитів ${data.chunks}, записів у відповідях ${data.totalEvents}. Повторний імпорт безпечний (дзвінки з тим самим id оновлюються).`,
      );
    } catch (e) {
      const msg = (e as { response?: { data?: { message?: string | string[] } } })?.response?.data
        ?.message;
      const text = Array.isArray(msg) ? msg.join(", ") : msg;
      setError(text ?? getUserFriendlyApiError(e, "Не вдалося виконати імпорт."));
    } finally {
      setBackfillBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Інтеграція Ringostat</h1>
          <p className="text-sm text-zinc-500">
            Налаштування телефонії Ringostat: увімкнення інтеграції, webhook/polling режими та
            прив'язка внутрішніх ліній до користувачів CRM.
          </p>
        </div>

        {loading ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-600 shadow-sm">
            Завантаження налаштувань...
          </div>
        ) : (
          <>
            {error ? <ErrorPanel variant="inline" message={error} /> : null}
            {success && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                {success}
              </div>
            )}
            {backfillMsg && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-800">
                {backfillMsg}
              </div>
            )}

            <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">
                    Увімкнути інтеграцію Ringostat
                  </div>
                  <div className="text-xs text-zinc-500">
                    Коли інтеграцію вимкнено, вебхуки та polling ігноруються.
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
                        (config?.useWebhook ?? true)
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-zinc-300 bg-zinc-100"
                      }`}
                    >
                      <span
                        className={`ml-1 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          (config?.useWebhook ?? true) ? "translate-x-4" : ""
                        }`}
                      />
                    </button>
                  </label>
                  <p className="text-xs text-zinc-500">
                    Увімкнений режим очікує POST-запит на{" "}
                    <code>/integrations/ringostat/webhook</code>.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="flex items-center justify-between gap-2 text-sm font-medium text-zinc-900">
                    <span>Polling (резервне джерело)</span>
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
                    Увімкнений polling періодично опитує Ringostat API для підтягування дзвінків і
                    записів.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">Секрет вебхука</label>
                  <input
                    type="password"
                    autoComplete="off"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder={
                      config?.webhookSecretMasked
                        ? "•••••••• — введіть новий, щоб змінити"
                        : "Той самий секрет вкажіть у кабінеті Ringostat в налаштуваннях вебхука"
                    }
                  />
                  <p className="text-xs text-zinc-500">
                    Заголовок у кабінеті Ringostat: X-Ringostat-Webhook-Secret
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
                    URL бекенду для вебхука. Скопіюйте Webhook URL нижче у кабінет Ringostat.
                  </p>
                </div>
              </div>
              {(publicBaseUrl || config?.publicBaseUrl) && (
                <div className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600 break-all">
                  Webhook URL: {(publicBaseUrl || config?.publicBaseUrl || "").replace(/\/+$/, "")}
                  /integrations/ringostat/webhook
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    API token (ключ доступу)
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={apiTokenValue}
                    onChange={(e) => setApiTokenValue(e.target.value)}
                    placeholder={
                      config?.apiTokenMasked
                        ? "•••••••• — введіть новий, щоб змінити"
                        : "Ключ із Ringostat -> Інтеграції -> Ringostat API"
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">Project ID</label>
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
                    placeholder="ID проєкту з Ringostat"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    Вікно polling, хвилин
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
                    API base URL (необов'язково)
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
                    Polling endpoint (необов'язково)
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
                    placeholder="/calls/list"
                  />
                </div>
              </div>

              <div className="border-t border-zinc-100 pt-4">
                <h2 className="text-sm font-semibold text-zinc-900">
                  Імпорт історії дзвінків (API)
                </h2>
                <p className="mt-1 text-xs text-zinc-500">
                  Підтягує дзвінки з Ringostat{" "}
                  <code className="rounded bg-zinc-100 px-0.5">/calls/list</code> за выбранные
                  за вибрані календарні дні (UTC). Запити йдуть чанками по 2 доби з перекриттям 15
                  хвилин, щоб не втрачати записи на межах. Потрібен збережений API token (і ті самі
                  project ID / endpoint, що й для polling).
                </p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-zinc-700">З дати (UTC)</label>
                    <input
                      type="date"
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      value={backfillFrom}
                      onChange={(e) => setBackfillFrom(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-zinc-700">До дати (UTC)</label>
                    <input
                      type="date"
                      className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      value={backfillTo}
                      onChange={(e) => setBackfillTo(e.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    disabled={backfillBusy}
                    onClick={() => void runBackfill()}
                    className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 disabled:opacity-50"
                  >
                    {backfillBusy ? "Імпорт..." : "Запустити імпорт"}
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">
                Мапінг внутрішніх ліній -> користувачі CRM
              </h2>
              <p className="text-xs text-zinc-500">
                Відповідальний менеджер визначається лише за цією таблицею (ключ - значення
                додаткового номера з Ringostat, наприклад{" "}
                <code className="rounded bg-zinc-100 px-0.5">extension_number</code>
                з вебхука). Якщо додаткового номера немає в таблиці, в налаштуваннях інтеграції
                можна вказати <code className="rounded bg-zinc-100 px-0.5">defaultManagerId</code>{" "}
                (fallback на одного користувача).
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
                        <td colSpan={3} className="px-3 py-3 text-xs text-zinc-500">
                          Поки що немає жодного запису. Додайте відповідність extension -> userId.
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
                              onChange={(e) => updateExtension(idx, "extension", e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                              value={row.userId}
                              onChange={(e) => updateExtension(idx, "userId", e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removeExtensionRow(idx)}
                              className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50"
                            >
                              Видалити
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
                + Додати extension
              </button>
            </div>

            <div className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">
                Мапінг робочого телефону -> користувачі CRM (fallback)
              </h2>
              <p className="text-xs text-zinc-500">
                Ringostat інколи не надсилає{" "}
                <code className="rounded bg-zinc-100 px-0.5">extension_number</code>. Тоді менеджер
                визначається за номером лінії/телефону з{" "}
                <code className="rounded bg-zinc-100 px-0.5">toNormalized</code>. Формат номера
                довільний - порівняння йде за цифрами.
              </p>

              <div className="overflow-hidden rounded-md border border-zinc-200">
                <table className="w-full text-left text-sm">
                  <thead className="bg-zinc-50 text-xs font-medium uppercase text-zinc-500">
                    <tr>
                      <th className="px-3 py-2">Телефон</th>
                      <th className="px-3 py-2">User ID</th>
                      <th className="w-12 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {phones.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-3 py-3 text-xs text-zinc-500">
                          Поки що немає жодного запису. Додайте відповідність телефон -> userId.
                        </td>
                      </tr>
                    ) : (
                      phones.map((row, idx) => (
                        <tr key={`${row.phone}-${idx}`}>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                              value={row.phone}
                              onChange={(e) => updatePhone(idx, "phone", e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                              value={row.userId}
                              onChange={(e) => updatePhone(idx, "userId", e.target.value)}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => removePhoneRow(idx)}
                              className="rounded border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 hover:bg-zinc-50"
                            >
                              Видалити
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
                onClick={addPhoneRow}
                className="rounded-md border border-dashed border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
              >
                + Додати телефон
              </button>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 disabled:opacity-50"
              >
                {saving ? "Збереження..." : "Зберегти"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
