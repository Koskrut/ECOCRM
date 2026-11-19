"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { strings } from "@/locales";

type AudienceKey = "buyers_12m" | "buyers_all" | "buyers_lapsed" | "leads_no_order";

type AudienceRow = {
  key: AudienceKey;
  audienceId: string | null;
  status: "idle" | "ok" | "empty" | "error";
  syncedAt: string | null;
  crmCount: number | null;
  metaReceived: number | null;
  error: string | null;
  warning: "small" | null;
};

type Config = {
  adAccountId: string | null;
  accessTokenMasked: string;
  enabled: boolean;
  lapsedDays: number;
  seedWindowDays: number;
  graphApiVersion: string;
  audiences: AudienceRow[];
};

const t = strings.settings.metaAudiencesPage;
const KEYS: AudienceKey[] = ["buyers_12m", "buyers_all", "buyers_lapsed", "leads_no_order"];

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "medium", timeStyle: "short" });
}

function noteFor(row: AudienceRow): string | null {
  if (row.error) return row.error;
  if (row.status === "empty") return t.warnings.empty;
  if (row.warning === "small") return t.warnings.small;
  return null;
}

export default function MetaAudiencesSettingsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [adAccount, setAdAccount] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [lapsedDays, setLapsedDays] = useState("120");
  const [seedWindowDays, setSeedWindowDays] = useState("365");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function applyConfig(data: Config) {
    setConfig(data);
    setAdAccount(data.adAccountId ?? "");
    setAccessToken("");
    setEnabled(Boolean(data.enabled));
    setLapsedDays(String(data.lapsedDays ?? 120));
    setSeedWindowDays(String(data.seedWindowDays ?? 365));
  }

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((response) => setRole(response.data?.user?.role ?? ""))
      .catch(() => setRole(""));
  }, []);

  useEffect(() => {
    if (role !== "ADMIN") {
      if (role !== null) setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiHttp
      .get<Config>("/settings/meta-audiences")
      .then((response) => {
        if (!cancelled) applyConfig(response.data);
      })
      .catch((cause) => {
        if (!cancelled) setError(getUserFriendlyApiError(cause, t.loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  const dirty = config
    ? adAccount.trim() !== (config.adAccountId ?? "") ||
      accessToken.trim() !== "" ||
      enabled !== config.enabled ||
      Number(lapsedDays) !== config.lapsedDays ||
      Number(seedWindowDays) !== config.seedWindowDays
    : true;

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, unknown> = {
        adAccountId: adAccount.trim(),
        enabled,
        lapsedDays: Number(lapsedDays),
        seedWindowDays: Number(seedWindowDays),
      };
      if (accessToken.trim()) body.accessToken = accessToken.trim();
      const response = await apiHttp.patch<Config>("/settings/meta-audiences", body);
      applyConfig(response.data);
      setSuccess(t.saved);
    } catch (cause) {
      setError(getUserFriendlyApiError(cause, t.saveError));
    } finally {
      setSaving(false);
    }
  }

  async function sync() {
    setSyncing(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiHttp.post<Config>("/settings/meta-audiences/sync", {}, { timeout: 300_000 });
      applyConfig(response.data);
    } catch (cause) {
      setError(getUserFriendlyApiError(cause, t.syncError));
    } finally {
      setSyncing(false);
    }
  }

  if (role === null || (role === "ADMIN" && loading && !config)) {
    return (
      <SettingsPageShell title={t.title} subtitle={t.subtitle}>
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      </SettingsPageShell>
    );
  }

  if (role !== "ADMIN") {
    return (
      <SettingsPageShell title={t.title}>
        <p className="text-sm text-zinc-600">{t.accessDenied}</p>
      </SettingsPageShell>
    );
  }

  const rows = KEYS.map((key) => config?.audiences.find((row) => row.key === key) ?? null);

  return (
    <SettingsPageShell maxWidthClassName="max-w-3xl" title={t.title} subtitle={t.subtitle}>
      <Link href="/settings/meta-lead-ads" className="mb-4 inline-block text-sm text-zinc-800 underline">
        {t.leadAdsLink}
      </Link>
      {error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {success ? <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{success}</p> : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-zinc-800">
            {t.adAccount}
            <input
              value={adAccount}
              onChange={(event) => setAdAccount(event.target.value)}
              placeholder="1234567890"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-zinc-500">{t.adAccountHint}</span>
          </label>
          <label className="block text-sm text-zinc-800">
            {t.token}
            <input
              type="password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder={config?.accessTokenMasked || t.token}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-zinc-500">
              {config?.accessTokenMasked ? `${t.tokenSaved}: ${config.accessTokenMasked}. ` : ""}
              {t.tokenHint}
            </span>
          </label>
          <label className="block text-sm text-zinc-800">
            {t.lapsedDays}
            <input
              inputMode="numeric"
              value={lapsedDays}
              onChange={(event) => setLapsedDays(event.target.value.replace(/\D/g, ""))}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm text-zinc-800">
            {t.seedWindow}
            <input
              inputMode="numeric"
              value={seedWindowDays}
              onChange={(event) => setSeedWindowDays(event.target.value.replace(/\D/g, ""))}
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-zinc-500">{t.windowHint}</p>
        <p className="mt-2 text-xs text-zinc-500">
          {t.graphVersion}: {config?.graphApiVersion || "v21.0"}
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm text-zinc-800">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          {t.enabled}
        </label>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || syncing}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {saving ? t.saving : t.save}
          </button>
          <button
            type="button"
            onClick={() => void sync()}
            disabled={syncing || saving || dirty || !enabled || !config?.accessTokenMasked || !config.adAccountId}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 disabled:opacity-50"
          >
            {syncing ? t.syncing : t.sync}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">{dirty ? t.saveBeforeSync : t.syncHint}</p>
      </section>

      <div className="mt-4 space-y-3">
        {rows.map((row, index) => {
          const key = KEYS[index];
          const message = row ? noteFor(row) : null;
          return (
            <section key={key} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-semibold text-zinc-900">{t.keys[key]}</h2>
                <span className="text-xs text-zinc-500">{t.purposes[key]}</span>
              </div>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-zinc-500">{t.columns.status}</dt>
                  <dd>{row ? t.status[row.status] : t.status.idle}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">{t.columns.synced}</dt>
                  <dd>{formatTime(row?.syncedAt ?? null)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">{t.columns.crm}</dt>
                  <dd>{row?.crmCount ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-zinc-500">{t.columns.meta}</dt>
                  <dd>{row?.metaReceived ?? "—"}</dd>
                </div>
              </dl>
              {row?.audienceId ? (
                <p className="mt-2 text-xs text-zinc-500">
                  {t.audienceId}: {row.audienceId}
                </p>
              ) : null}
              {message ? (
                <p className={`mt-2 text-sm ${row?.status === "error" ? "text-red-800" : "text-amber-800"}`}>{message}</p>
              ) : null}
            </section>
          );
        })}
      </div>
    </SettingsPageShell>
  );
}
