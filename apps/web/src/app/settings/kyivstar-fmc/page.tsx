"use client";

import { useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { ErrorPanel } from "@/components/feedback";
import {
  SearchableSelectLite,
  type Option,
} from "@/components/inputs/SearchableSelectLite";

type UserRow = { id: string; fullName: string; email: string };

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

type KyivstarFmcConfig = {
  isEnabled?: boolean;
  useWebhook?: boolean;
  usePolling?: boolean;
  pollingLookbackMinutes?: number;
  integratorId?: string;
  phonesToUserId?: Record<string, string>;
  defaultManagerId?: string;
  apiBaseUrl?: string;
  publicBaseUrl?: string;
  webhookSecretMasked?: string;
  apiTokenMasked?: string;
};

export default function KyivstarFmcSettingsPage() {
  const [config, setConfig] = useState<KyivstarFmcConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [phones, setPhones] = useState<Array<{ phone: string; userId: string }>>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
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
      setLoadingUsers(true);
      setError(null);
      try {
        const [configRes, usersRes] = await Promise.all([
          apiHttp.get<KyivstarFmcConfig>("/settings/kyivstar-fmc"),
          apiHttp.get<{ items: UserRow[] }>("/users"),
        ]);
        const data = configRes.data ?? {};
        setConfig(data);
        setPublicBaseUrl(data.publicBaseUrl ?? "");
        const p = data.phonesToUserId ?? {};
        setPhones(Object.entries(p).map(([phone, userId]) => ({ phone, userId })));
        setUsers(Array.isArray(usersRes.data?.items) ? usersRes.data.items : []);
      } catch (e) {
        setError(getUserFriendlyApiError(e, "Не вдалося завантажити налаштування Kyivstar FMC."));
      } finally {
        setLoading(false);
        setLoadingUsers(false);
      }
    };
    void load();
  }, []);

  const userSelectOptions = useMemo<Option[]>(() => {
    const base = users.map((u) => ({
      id: u.id,
      label: u.fullName?.trim() || u.email || u.id,
    }));
    const knownIds = new Set(base.map((o) => o.id));
    const extras: Option[] = [];
    const addExtra = (id: string | undefined) => {
      if (!id || knownIds.has(id)) return;
      extras.push({ id, label: id });
      knownIds.add(id);
    };
    addExtra(config?.defaultManagerId);
    for (const row of phones) addExtra(row.userId);
    return [...extras, ...base];
  }, [users, config?.defaultManagerId, phones]);

  const handleToggle = (key: "isEnabled" | "useWebhook" | "usePolling") => {
    setConfig((prev) => ({ ...(prev ?? {}), [key]: !prev?.[key] }));
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
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
        usePolling: config.usePolling ?? true,
        pollingLookbackMinutes: config.pollingLookbackMinutes ?? 15,
        integratorId: config.integratorId ?? undefined,
        apiBaseUrl: config.apiBaseUrl ?? undefined,
        phonesToUserId,
        defaultManagerId: config.defaultManagerId ?? undefined,
        publicBaseUrl: publicBaseUrl.trim() || undefined,
      };
      if (apiTokenValue.trim()) payload.apiToken = apiTokenValue.trim();
      if (webhookSecret.trim()) payload.webhookSecret = webhookSecret.trim();

      const res = await apiHttp.patch<KyivstarFmcConfig>("/settings/kyivstar-fmc", payload);
      setConfig(res.data);
      setApiTokenValue("");
      setWebhookSecret("");
      setPublicBaseUrl(res.data.publicBaseUrl ?? publicBaseUrl);
      const p = res.data.phonesToUserId ?? {};
      setPhones(Object.entries(p).map(([phone, userId]) => ({ phone, userId })));
      setSuccess("Налаштування Kyivstar FMC збережено.");
    } catch (e) {
      setError(getUserFriendlyApiError(e, "Не вдалося зберегти налаштування Kyivstar FMC."));
    } finally {
      setSaving(false);
    }
  };

  const updatePhone = (index: number, field: "phone" | "userId", value: string) => {
    setPhones((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
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
        processed: number;
      }>("/settings/kyivstar-fmc/backfill", { from: fromIso, to: toIso }, { timeout: 600_000 });
      const data = r.data;
      setBackfillMsg(
        `Готово: API-запитів ${data.chunks}, записів ${data.totalEvents}, оброблено ${data.processed}.`,
      );
    } catch (e) {
      setError(getUserFriendlyApiError(e, "Не вдалося виконати імпорт."));
    } finally {
      setBackfillBusy(false);
    }
  };

  const remoteUrl =
    (publicBaseUrl || config?.publicBaseUrl || "").replace(/\/+$/, "") +
    "/integrations/kyivstar-fmc";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Інтеграція Kyivstar FMC</h1>
          <p className="text-sm text-zinc-500">
            Пряма інтеграція з віртуальною мобільною АТС Київстар (Generic FMC API): імпорт історії
            дзвінків, webhook станів та записи розмов.
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
              <div className="rounded-md border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-900">
                <strong>Click2Dial:</strong> кожен менеджер має мати свій Kyivstar-номер у маппінгу нижче —
                тоді в картках контактів/лідів з&apos;явиться кнопка дзвінка через FMC API.
                <br />
                <strong>Popup:</strong> при вхідному дзвінку (webhook alerting) CRM показує картку зверху справа;
                дозвольте browser notifications для сповіщень у фоні.
              </div>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-zinc-900">Увімкнути інтеграцію</div>
                  <div className="text-xs text-zinc-500">
                    Потрібен пакет «Конвергентний» + «API FMC» на номерах АТС.
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
                    <span>Webhook callstate</span>
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
                    Kyivstar надсилає POST на <code>/callstate</code> (доповнює URL нижче).
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="flex items-center justify-between gap-2 text-sm font-medium text-zinc-900">
                    <span>Polling callhistory</span>
                    <button
                      type="button"
                      onClick={() => handleToggle("usePolling")}
                      className={`inline-flex h-6 w-11 items-center rounded-full border transition ${
                        (config?.usePolling ?? true)
                          ? "border-emerald-500 bg-emerald-500"
                          : "border-zinc-300 bg-zinc-100"
                      }`}
                    >
                      <span
                        className={`ml-1 inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                          (config?.usePolling ?? true) ? "translate-x-4" : ""
                        }`}
                      />
                    </button>
                  </label>
                  <p className="text-xs text-zinc-500">
                    Основне джерело історії — імпорт кожні 5 хвилин з FMC API.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    Токен віддаленої системи (webhook)
                  </label>
                  <input
                    type="password"
                    autoComplete="off"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={webhookSecret}
                    onChange={(e) => setWebhookSecret(e.target.value)}
                    placeholder={
                      config?.webhookSecretMasked
                        ? "•••••••• — введіть новий, щоб змінити"
                        : "Bearer-токен для перевірки webhook"
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    Public base URL CRM
                  </label>
                  <input
                    type="url"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={publicBaseUrl}
                    onChange={(e) => setPublicBaseUrl(e.target.value)}
                    placeholder="https://crm.example.com"
                  />
                </div>
              </div>

              {remoteUrl.startsWith("http") && (
                <div className="rounded-md bg-zinc-100 px-3 py-2 text-xs text-zinc-600 break-all">
                  <div>
                    URL віддаленої системи (портал Kyivstar):{" "}
                    <strong>{remoteUrl}</strong>
                  </div>
                  <div className="mt-1">
                    Webhook callstate: <strong>{remoteUrl}/callstate</strong>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">FMC Token</label>
                  <input
                    type="password"
                    autoComplete="off"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={apiTokenValue}
                    onChange={(e) => setApiTokenValue(e.target.value)}
                    placeholder={
                      config?.apiTokenMasked
                        ? "•••••••• — введіть новий, щоб змінити"
                        : "З розділу «Інтеграція з CRM» на fmc.kyivstar.ua"
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">Integrator ID</label>
                  <input
                    type="text"
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={config?.integratorId ?? ""}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...(prev ?? {}),
                        integratorId: e.target.value || undefined,
                      }))
                    }
                    placeholder="Код інтегратора від Kyivstar"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    Вікно polling, хвилин
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                    value={config?.pollingLookbackMinutes ?? 15}
                    onChange={(e) =>
                      setConfig((prev) => ({
                        ...(prev ?? {}),
                        pollingLookbackMinutes: Number(e.target.value) || 15,
                      }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-zinc-700">
                    Менеджер за замовчуванням
                  </label>
                  <SearchableSelectLite
                    value={config?.defaultManagerId ?? ""}
                    options={userSelectOptions}
                    placeholder="Оберіть співробітника…"
                    disabled={loadingUsers}
                    isLoading={loadingUsers}
                    onChange={(id) =>
                      setConfig((prev) => ({
                        ...(prev ?? {}),
                        defaultManagerId: id || undefined,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm font-medium text-zinc-900">
                  Маппінг номерів менеджерів → співробітник
                </div>
                {phones.map((row, index) => (
                  <div key={index} className="flex gap-2">
                    <input
                      type="text"
                      className="flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      placeholder="+380..."
                      value={row.phone}
                      onChange={(e) => updatePhone(index, "phone", e.target.value)}
                    />
                    <div className="flex-1">
                      <SearchableSelectLite
                        value={row.userId}
                        options={userSelectOptions}
                        placeholder="Оберіть співробітника…"
                        disabled={loadingUsers}
                        isLoading={loadingUsers}
                        onChange={(id) => updatePhone(index, "userId", id ?? "")}
                      />
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs text-sky-700 hover:underline"
                  onClick={() => setPhones((prev) => [...prev, { phone: "", userId: "" }])}
                >
                  + Додати номер
                </button>
              </div>

              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Збереження..." : "Зберегти"}
              </button>
            </div>

            <div className="space-y-3 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-zinc-900">Імпорт історії дзвінків</h2>
              <div className="flex flex-wrap gap-3">
                <input
                  type="date"
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  value={backfillFrom}
                  onChange={(e) => setBackfillFrom(e.target.value)}
                />
                <input
                  type="date"
                  className="rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                  value={backfillTo}
                  onChange={(e) => setBackfillTo(e.target.value)}
                />
                <button
                  type="button"
                  disabled={backfillBusy}
                  onClick={() => void runBackfill()}
                  className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
                >
                  {backfillBusy ? "Імпорт..." : "Запустити backfill"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
  );
}
