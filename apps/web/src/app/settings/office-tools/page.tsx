"use client";

import { useCallback, useEffect, useState } from "react";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import {
  officeToolsApi,
  type OfficeToolsConfig,
  type OfficeToolsStatus,
} from "@/lib/api/resources/office-tools";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { strings } from "@/locales";

type UnmatchedReceipt = {
  id: string;
  compName?: string | null;
  code?: string | null;
  amount: string | number;
  docDate?: string | null;
  currency?: string;
};

export default function OfficeToolsSettingsPage() {
  const t = strings.settings.officeTools;
  const [config, setConfig] = useState<OfficeToolsConfig | null>(null);
  const [status, setStatus] = useState<OfficeToolsStatus | null>(null);
  const [unmatched, setUnmatched] = useState<UnmatchedReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [matchOrderId, setMatchOrderId] = useState<Record<string, string>>({});
  const [apiKey, setApiKey] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgRes, statusRes, unmatchedRes] = await Promise.all([
        officeToolsApi.getConfig(),
        officeToolsApi.getStatus(),
        officeToolsApi.listUnmatched(50).catch(() => ({ data: [] })),
      ]);
      setConfig(cfgRes.data ?? null);
      setStatus(statusRes.data ?? null);
      setUnmatched(Array.isArray(unmatchedRes.data) ? unmatchedRes.data : []);
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.loadError));
    } finally {
      setLoading(false);
    }
  }, [t.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload: Partial<OfficeToolsConfig> = {
        isEnabled: config.isEnabled,
        baseUrl: config.baseUrl,
        stockId: config.stockId,
        empId: config.empId,
        managerId: config.managerId,
        codeId1: config.codeId1,
        currId: config.currId,
      };
      if (apiKey !== "") payload.apiKey = apiKey;
      const res = await officeToolsApi.patchConfig(payload);
      setConfig(res.data ?? config);
      setApiKey("");
      setSuccess(t.saved);
      await load();
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.saveError));
    } finally {
      setSaving(false);
    }
  }

  async function runSync(kind: "all" | "stock" | "payments" | "receivables") {
    setSyncing(kind);
    setError(null);
    setSuccess(null);
    try {
      if (kind === "all") await officeToolsApi.syncAll();
      else if (kind === "stock") await officeToolsApi.syncStock();
      else if (kind === "payments") await officeToolsApi.syncPayments();
      else await officeToolsApi.syncReceivables();
      setSuccess(t.syncDone);
      await load();
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.syncError));
    } finally {
      setSyncing(null);
    }
  }

  async function matchReceipt(id: string) {
    const orderId = matchOrderId[id]?.trim();
    if (!orderId) return;
    setError(null);
    try {
      await officeToolsApi.matchReceipt(id, orderId);
      setSuccess(t.matchDone);
      await load();
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.matchError));
    }
  }

  if (loading) {
    return (
      <SettingsPageShell title={t.title} subtitle={t.subtitle}>
        <PageLoading />
      </SettingsPageShell>
    );
  }

  return (
    <SettingsPageShell title={t.title} subtitle={t.subtitle} maxWidthClassName="max-w-3xl">
      {error ? <ErrorPanel message={error} className="mb-4" /> : null}
      {success ? (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </div>
      ) : null}

      {config ? (
        <div className="space-y-6 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
          <label className="flex items-center gap-3 text-sm font-medium text-zinc-800">
            <input
              type="checkbox"
              checked={Boolean(config.isEnabled)}
              onChange={() =>
                setConfig((prev) => (prev ? { ...prev, isEnabled: !prev.isEnabled } : prev))
              }
            />
            {t.enabled}
          </label>
          <p className="text-sm text-zinc-500">{t.enabledHint}</p>

          <div>
            <label className="block text-sm font-medium text-zinc-700">{t.baseUrl}</label>
            <input
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700">{t.apiKey}</label>
            <p className="mt-0.5 text-xs text-zinc-500">{t.apiKeyHint}</p>
            <input
              type="password"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config.apiKeyMasked || t.apiKeyPlaceholder}
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(
              [
                ["stockId", t.stockId],
                ["empId", t.empId],
                ["managerId", t.managerId],
                ["codeId1", t.codeId1],
                ["currId", t.currId],
              ] as const
            ).map(([key, label]) => (
              <div key={key}>
                <label className="block text-sm font-medium text-zinc-700">{label}</label>
                <input
                  type="number"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
                  value={config[key] ?? ""}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      [key]: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>
            ))}
          </div>

          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? t.saving : t.save}
          </button>
        </div>
      ) : null}

      <div className="mt-6 space-y-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">{t.syncTitle}</h2>
        <p className="text-sm text-zinc-500">{t.syncHint}</p>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", t.syncAll],
              ["stock", t.syncStock],
              ["payments", t.syncPayments],
              ["receivables", t.syncReceivables],
            ] as const
          ).map(([kind, label]) => (
            <button
              key={kind}
              type="button"
              disabled={Boolean(syncing) || !config?.isEnabled}
              onClick={() => void runSync(kind)}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
            >
              {syncing === kind ? "…" : label}
            </button>
          ))}
        </div>
        {status ? (
          <div className="mt-3 space-y-1 text-xs text-zinc-600">
            <div>
              {t.unmatchedCount}: {status.unmatchedReceipts}
            </div>
            {Object.entries(status.entities ?? {}).map(([entity, row]) => (
              <div key={entity}>
                {entity}: {row.status ?? "—"}{" "}
                {row.lastSyncAt ? `(${new Date(row.lastSyncAt).toLocaleString()})` : ""}
                {row.error ? ` — ${row.error}` : ""}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="mt-6 space-y-3 rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-zinc-900">{t.unmatchedTitle}</h2>
        {unmatched.length === 0 ? (
          <p className="text-sm text-zinc-500">{t.unmatchedEmpty}</p>
        ) : (
          <ul className="space-y-3">
            {unmatched.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-end gap-2 border-b border-zinc-100 pb-3 text-sm"
              >
                <div className="min-w-[12rem] flex-1">
                  <div className="font-medium text-zinc-800">{row.compName || row.code || row.id}</div>
                  <div className="text-zinc-500">
                    {row.docDate ? new Date(row.docDate).toLocaleDateString() : "—"} · {row.amount}{" "}
                    {row.currency || "UAH"}
                  </div>
                </div>
                <input
                  className="rounded border border-zinc-300 px-2 py-1 text-sm"
                  placeholder={t.orderIdPlaceholder}
                  value={matchOrderId[row.id] ?? ""}
                  onChange={(e) =>
                    setMatchOrderId((prev) => ({ ...prev, [row.id]: e.target.value }))
                  }
                />
                <button
                  type="button"
                  className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white"
                  onClick={() => void matchReceipt(row.id)}
                >
                  {t.match}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SettingsPageShell>
  );
}
