"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { strings } from "@/locales";

type Config = {
  pixelId: string;
  accessTokenMasked: string;
  testEventCode: string;
  enabled: boolean;
  graphApiVersion: string;
  lastSuccessAt: string | null;
  lastEventName: string | null;
  lastError: string | null;
};

type TestResult = { ok: boolean; error: string | null; config: Config };

const t = strings.settings.metaConversionsPage;

function formatTime(iso: string | null): string {
  if (!iso) return t.none;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return t.none;
  return date.toLocaleString("uk-UA", { timeZone: "Europe/Kyiv", dateStyle: "medium", timeStyle: "short" });
}

export default function MetaConversionsSettingsPage() {
  const [role, setRole] = useState<string | null>(null);
  const [config, setConfig] = useState<Config | null>(null);
  const [pixelId, setPixelId] = useState("1262413015423388");
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function applyConfig(data: Config) {
    setConfig(data);
    setPixelId(data.pixelId || "1262413015423388");
    setAccessToken("");
    setTestEventCode(data.testEventCode ?? "");
    setEnabled(Boolean(data.enabled));
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
      .get<Config>("/settings/meta-conversions")
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
    ? pixelId.trim() !== (config.pixelId ?? "") ||
      accessToken.trim() !== "" ||
      testEventCode.trim() !== (config.testEventCode ?? "") ||
      enabled !== config.enabled
    : true;

  async function save() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, unknown> = {
        pixelId: pixelId.trim(),
        testEventCode: testEventCode.trim(),
        enabled,
      };
      if (accessToken.trim()) body.accessToken = accessToken.trim();
      const response = await apiHttp.patch<Config>("/settings/meta-conversions", body);
      applyConfig(response.data);
      setSuccess(t.saved);
    } catch (cause) {
      setError(getUserFriendlyApiError(cause, t.saveError));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await apiHttp.post<TestResult>("/settings/meta-conversions/test", {}, { timeout: 30_000 });
      applyConfig(response.data.config);
      if (response.data.ok) setSuccess(t.testOk);
      else setError(response.data.error || t.testError);
    } catch (cause) {
      setError(getUserFriendlyApiError(cause, t.testError));
    } finally {
      setTesting(false);
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

  return (
    <SettingsPageShell maxWidthClassName="max-w-3xl" title={t.title} subtitle={t.subtitle}>
      {error ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}
      {success ? <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{success}</p> : null}

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm text-zinc-800">
            {t.pixel}
            <input
              value={pixelId}
              onChange={(event) => setPixelId(event.target.value.replace(/\D/g, "").slice(0, 20))}
              placeholder="1262413015423388"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-zinc-500">{t.pixelHint}</span>
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
          <label className="block text-sm text-zinc-800 md:col-span-2">
            {t.testCode}
            <input
              value={testEventCode}
              onChange={(event) => setTestEventCode(event.target.value.slice(0, 64))}
              autoComplete="off"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-zinc-500">{t.testCodeHint}</span>
          </label>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
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
            disabled={saving || testing}
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {saving ? t.saving : t.save}
          </button>
          <button
            type="button"
            onClick={() => void sendTest()}
            disabled={testing || saving || dirty || !config?.testEventCode || !config.enabled || !config.accessTokenMasked}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-900 disabled:opacity-50"
          >
            {testing ? t.testing : t.test}
          </button>
        </div>
        <p className="mt-2 text-xs text-zinc-500">{t.testHint}</p>
        <dl className="mt-4 grid gap-2 text-sm text-zinc-800">
          <div>
            <dt className="text-xs text-zinc-500">{t.lastSuccess}</dt>
            <dd>{formatTime(config?.lastSuccessAt ?? null)}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">{t.lastEvent}</dt>
            <dd>{config?.lastEventName || t.none}</dd>
          </div>
          <div>
            <dt className="text-xs text-zinc-500">{t.lastError}</dt>
            <dd className={config?.lastError ? "text-red-700" : ""}>{config?.lastError || t.none}</dd>
          </div>
        </dl>
      </section>
    </SettingsPageShell>
  );
}
