"use client";

import { useEffect, useMemo, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { strings } from "@/locales";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { ErrorPanel, PageLoading, useToast } from "@/components/feedback";
import {
  NpCitySelect,
  NpSenderContactSelect,
  NpSenderCounterpartySelect,
  NpWarehouseSelect,
} from "@/components/inputs/NpDirectorySelects";

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
  declaredCostMode?: "minimum_200" | "order_total";
  apiKeyMasked?: string;
  senderCityLabel?: string;
  senderWarehouseLabel?: string;
};

type SetupStatus = "ready" | "partial" | "needsKey";

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none";

function computeSetupStatus(config: NovaPoshtaSettings): SetupStatus {
  const senderComplete = [
    config.senderCityRef?.trim(),
    config.senderWarehouseRef?.trim(),
    config.senderCounterpartyRef?.trim(),
    config.senderContactRef?.trim(),
    config.senderPhone?.trim(),
  ].every(Boolean);

  if (senderComplete) return "ready";
  if (!config.apiKeyMasked) return "needsKey";
  return "partial";
}

export default function NovaPoshtaSettingsPage() {
  const t = strings.settings.novaPoshtaPage;
  const card = strings.settings.cards.novaPoshta;
  const { pushToast } = useToast();

  const [config, setConfig] = useState<NovaPoshtaSettings | null>(null);
  const [senderCityLabel, setSenderCityLabel] = useState("");
  const [senderWarehouseLabel, setSenderWarehouseLabel] = useState("");
  const [senderCounterpartyLabel, setSenderCounterpartyLabel] = useState("");
  const [senderContactLabel, setSenderContactLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [clearStoredApiKey, setClearStoredApiKey] = useState(false);
  const [apiAdvancedOpen, setApiAdvancedOpen] = useState(false);
  const [syncingCatalog, setSyncingCatalog] = useState(false);

  const setupStatus = useMemo(
    () => (config ? computeSetupStatus(config) : "partial"),
    [config],
  );

  const statusBadge = useMemo(() => {
    if (setupStatus === "ready") {
      return {
        label: t.statusReady,
        className: "border-emerald-200 bg-emerald-50 text-emerald-800",
      };
    }
    if (setupStatus === "needsKey") {
      return {
        label: t.statusNeedsKey,
        className: "border-amber-200 bg-amber-50 text-amber-900",
      };
    }
    return {
      label: t.statusPartial,
      className: "border-zinc-200 bg-zinc-100 text-zinc-700",
    };
  }, [setupStatus, t]);

  const senderChecklist = useMemo(() => {
    if (!config) return [];
    return [
      { ok: !!config.senderCityRef?.trim(), label: t.senderCity },
      { ok: !!config.senderWarehouseRef?.trim(), label: t.senderWarehouse },
      { ok: !!config.senderCounterpartyRef?.trim(), label: t.senderCounterparty },
      { ok: !!config.senderContactRef?.trim(), label: t.senderContact },
      { ok: !!config.senderPhone?.trim(), label: t.senderPhone },
    ];
  }, [config, t]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiHttp.get<NovaPoshtaSettings>("/settings/nova-poshta");
        const data = res.data ?? {};
        setConfig(data);
        setSenderCityLabel(data.senderCityLabel ?? "");
        setSenderWarehouseLabel(data.senderWarehouseLabel ?? "");
        setApiKeyInput("");
        setApiAdvancedOpen(!!(data.apiUrl?.trim() || data.apiTimeoutMs));

        if (data.senderCounterpartyRef) {
          try {
            const cpRes = await apiHttp.get<{
              items?: { ref: string; label: string }[];
            }>("/np/sender-counterparties");
            const match = (cpRes.data?.items ?? []).find(
              (i) => i.ref === data.senderCounterpartyRef,
            );
            setSenderCounterpartyLabel(match?.label ?? "");
          } catch {
            setSenderCounterpartyLabel("");
          }
        } else {
          setSenderCounterpartyLabel("");
        }

        if (data.senderCounterpartyRef && data.senderContactRef) {
          try {
            const ctRes = await apiHttp.get<{
              items?: { ref: string; label: string }[];
            }>(
              `/np/sender-contacts?counterpartyRef=${encodeURIComponent(data.senderCounterpartyRef)}`,
            );
            const match = (ctRes.data?.items ?? []).find(
              (i) => i.ref === data.senderContactRef,
            );
            setSenderContactLabel(match?.label ?? "");
          } catch {
            setSenderContactLabel("");
          }
        } else {
          setSenderContactLabel("");
        }
      } catch (e) {
        setError(getUserFriendlyApiError(e, t.loadError));
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [t.loadError]);

  const handleSyncCatalog = async () => {
    setSyncingCatalog(true);
    setError(null);
    try {
      await apiHttp.post("/np/sync", {}, { timeout: 180_000 });
      pushToast(t.syncCatalogSuccess, "success");
    } catch (e) {
      const msg = getUserFriendlyApiError(e, t.syncCatalogError);
      pushToast(msg, "error");
      setError(msg);
    } finally {
      setSyncingCatalog(false);
    }
  };

  const handleSave = async () => {
    if (!config) return;
    setSaving(true);
    setError(null);
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
        declaredCostMode: config.declaredCostMode ?? "minimum_200",
      };
      if (clearStoredApiKey) body.apiKey = "";
      else if (apiKeyInput.trim()) body.apiKey = apiKeyInput.trim();
      const res = await apiHttp.patch<NovaPoshtaSettings>("/settings/nova-poshta", body);
      const data = res.data ?? {};
      setConfig(data);
      setSenderCityLabel(data.senderCityLabel ?? senderCityLabel);
      setSenderWarehouseLabel(data.senderWarehouseLabel ?? senderWarehouseLabel);
      setApiKeyInput("");
      setClearStoredApiKey(false);
      pushToast(t.saveSuccess, "success");
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.saveError));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsPageShell
      maxWidthClassName="max-w-2xl"
      title={card.title}
      subtitle={t.subtitle}
      actions={
        !loading && config ? (
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadge.className}`}
            >
              {statusBadge.label}
            </span>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? `${strings.common.save}…` : strings.common.save}
            </button>
          </div>
        ) : null
      }
    >
      {error ? <ErrorPanel variant="inline" message={error} className="mb-4" /> : null}

      {loading || !config ? (
        <PageLoading inline />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div>
              <div className="text-sm font-semibold text-zinc-900">{t.integrationTitle}</div>
              <div className="mt-0.5 text-xs text-zinc-500">{t.integrationHint}</div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!config.isEnabled}
              onClick={() => setConfig({ ...config, isEnabled: !config.isEnabled })}
              className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                config.isEnabled
                  ? "border-emerald-500 bg-emerald-500"
                  : "border-zinc-300 bg-zinc-100"
              }`}
            >
              <span
                className={`ml-1 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  config.isEnabled ? "translate-x-4" : ""
                }`}
              />
            </button>
          </div>

          <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">{t.sectionApi}</h2>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">{t.apiKeyLabel}</label>
              <p className="mt-0.5 text-xs text-zinc-500">
                {config.apiKeyMasked
                  ? t.apiKeySaved.replace("{masked}", config.apiKeyMasked)
                  : t.apiKeyEnv}
              </p>
              <input
                type="password"
                autoComplete="off"
                className={inputClass}
                placeholder={t.apiKeyPlaceholder}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
              />
            </div>

            <details
              open={apiAdvancedOpen}
              onToggle={(e) => setApiAdvancedOpen((e.target as HTMLDetailsElement).open)}
              className="rounded-lg border border-zinc-100 bg-zinc-50/80"
            >
              <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-zinc-700 hover:text-zinc-900">
                {t.apiAdvanced}
              </summary>
              <div className="space-y-3 border-t border-zinc-100 px-3 py-3">
                <p className="text-xs text-zinc-500">{t.apiAdvancedHint}</p>
                <div>
                  <label className="block text-xs font-medium text-zinc-600">{t.apiUrlLabel}</label>
                  <input
                    className={inputClass}
                    placeholder="https://api.novaposhta.ua/v2.0/json/"
                    value={config.apiUrl ?? ""}
                    onChange={(e) => setConfig({ ...config, apiUrl: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-600">
                    {t.apiTimeoutLabel}
                  </label>
                  <input
                    type="number"
                    min={1000}
                    className={`${inputClass} max-w-xs`}
                    placeholder="30000"
                    value={config.apiTimeoutMs ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        apiTimeoutMs: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                </div>
                {config.apiKeyMasked ? (
                  <label className="flex items-center gap-2 text-xs text-zinc-600">
                    <input
                      type="checkbox"
                      checked={clearStoredApiKey}
                      onChange={(e) => setClearStoredApiKey(e.target.checked)}
                    />
                    {t.clearKey}
                  </label>
                ) : null}
              </div>
            </details>
          </section>

          <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">{t.sectionSender}</h2>
              <p className="mt-0.5 text-xs text-zinc-500">{t.sectionSenderHint}</p>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border border-zinc-100 bg-zinc-50/80 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800">{t.syncCatalogTitle}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{t.syncCatalogHint}</p>
              </div>
              <button
                type="button"
                disabled={syncingCatalog || saving}
                onClick={() => void handleSyncCatalog()}
                className="shrink-0 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50"
              >
                {syncingCatalog ? t.syncCatalogRunning : t.syncCatalogButton}
              </button>
            </div>

            {setupStatus !== "ready" ? (
              <ul className="flex flex-wrap gap-2">
                {senderChecklist.map((item) => (
                  <li
                    key={item.label}
                    className={`rounded-full px-2.5 py-0.5 text-xs ${
                      item.ok
                        ? "bg-emerald-50 text-emerald-800"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {item.ok ? "✓ " : ""}
                    {item.label}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700">{t.senderCity}</label>
                <NpCitySelect
                  valueRef={config.senderCityRef ?? ""}
                  valueLabel={senderCityLabel}
                  onChange={(ref, label) => {
                    setConfig({
                      ...config,
                      senderCityRef: ref,
                      senderWarehouseRef: "",
                    });
                    setSenderCityLabel(label);
                    setSenderWarehouseLabel("");
                  }}
                  placeholder={t.cityPlaceholder}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700">
                  {t.senderWarehouse}
                </label>
                <NpWarehouseSelect
                  cityRef={config.senderCityRef ?? ""}
                  type="WAREHOUSE"
                  valueRef={config.senderWarehouseRef ?? ""}
                  valueLabel={senderWarehouseLabel}
                  onChange={(ref, label) => {
                    setConfig({ ...config, senderWarehouseRef: ref });
                    setSenderWarehouseLabel(label);
                  }}
                  placeholder={t.warehousePlaceholder}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  {t.senderCounterparty}
                </label>
                <NpSenderCounterpartySelect
                  valueRef={config.senderCounterpartyRef ?? ""}
                  valueLabel={senderCounterpartyLabel}
                  onChange={(ref, label) => {
                    setConfig({
                      ...config,
                      senderCounterpartyRef: ref,
                      senderContactRef: "",
                    });
                    setSenderCounterpartyLabel(label);
                    setSenderContactLabel("");
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">{t.senderContact}</label>
                <NpSenderContactSelect
                  counterpartyRef={config.senderCounterpartyRef ?? ""}
                  valueRef={config.senderContactRef ?? ""}
                  valueLabel={senderContactLabel}
                  onChange={(ref, label) => {
                    setConfig({ ...config, senderContactRef: ref });
                    setSenderContactLabel(label);
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-zinc-700">{t.senderPhone}</label>
                <input
                  type="tel"
                  className={inputClass}
                  placeholder={t.senderPhonePlaceholder}
                  value={config.senderPhone ?? ""}
                  onChange={(e) => setConfig({ ...config, senderPhone: e.target.value })}
                />
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div>
              <h2 className="text-sm font-semibold text-zinc-900">{t.sectionTtnDefaults}</h2>
              <p className="mt-0.5 text-xs text-zinc-500">{t.sectionTtnDefaultsHint}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-zinc-700">{t.payerLabel}</label>
                <select
                  className={inputClass}
                  value={config.defaultPayerType ?? "Recipient"}
                  onChange={(e) => setConfig({ ...config, defaultPayerType: e.target.value })}
                >
                  <option value="Recipient">{t.payerRecipient}</option>
                  <option value="Sender">{t.payerSender}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">{t.paymentLabel}</label>
                <select
                  className={inputClass}
                  value={config.defaultPaymentMethod ?? "Cash"}
                  onChange={(e) => setConfig({ ...config, defaultPaymentMethod: e.target.value })}
                >
                  <option value="Cash">{t.paymentCash}</option>
                  <option value="NonCash">{t.paymentNonCash}</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-zinc-100 bg-zinc-50/80 p-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-zinc-800">{t.declaredCostTitle}</p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {(config.declaredCostMode ?? "minimum_200") === "order_total"
                    ? t.declaredCostOrderHint
                    : t.declaredCostMinHint}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={(config.declaredCostMode ?? "minimum_200") === "order_total"}
                aria-label={t.declaredCostTitle}
                onClick={() =>
                  setConfig({
                    ...config,
                    declaredCostMode:
                      (config.declaredCostMode ?? "minimum_200") === "order_total"
                        ? "minimum_200"
                        : "order_total",
                  })
                }
                className={`inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition ${
                  (config.declaredCostMode ?? "minimum_200") === "order_total"
                    ? "border-emerald-500 bg-emerald-500"
                    : "border-zinc-300 bg-zinc-100"
                }`}
              >
                <span
                  className={`ml-1 inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${
                    (config.declaredCostMode ?? "minimum_200") === "order_total"
                      ? "translate-x-4"
                      : ""
                  }`}
                />
              </button>
            </div>
          </section>

          <div className="flex justify-end border-t border-zinc-200 pt-4 sm:hidden">
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="w-full rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-50"
            >
              {saving ? `${strings.common.save}…` : strings.common.save}
            </button>
          </div>
        </div>
      )}
    </SettingsPageShell>
  );
}
