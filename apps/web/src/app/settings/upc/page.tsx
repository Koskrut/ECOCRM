"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { strings } from "@/locales";
import { ErrorPanel } from "@/components/feedback";

type BankAccount = { id: string; name: string; provider?: string; iban?: string | null };
type UpcSettings = {
  isEnabled?: boolean;
  clientId?: string;
  redirectUri?: string;
  apiBaseUrl?: string;
  clientIdMasked?: string;
};
type ConsentStatus = { status?: string; consentId?: string };

export default function UpcSettingsPage() {
  const s = strings.settings.upc;
  const [settings, setSettings] = useState<UpcSettings | null>(null);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [consents, setConsents] = useState<Record<string, ConsentStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [redirectUri, setRedirectUri] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [settingsRes, accountsRes] = await Promise.all([
        apiHttp.get<UpcSettings>("/integrations/upc/settings"),
        apiHttp.get<BankAccount[]>("/bank/accounts"),
      ]);
      setSettings(settingsRes.data);
      setClientId(settingsRes.data.clientId ?? "");
      setRedirectUri(settingsRes.data.redirectUri ?? "");
      const upcAccounts = (Array.isArray(accountsRes.data) ? accountsRes.data : []).filter(
        (a) => a.provider === "UPC",
      );
      setAccounts(upcAccounts);
      const statusEntries = await Promise.all(
        upcAccounts.map(async (acc) => {
          try {
            const r = await apiHttp.get<ConsentStatus>(
              `/integrations/upc/consent/status/${acc.id}`,
            );
            return [acc.id, r.data] as const;
          } catch {
            return [acc.id, { status: "NONE" }] as const;
          }
        }),
      );
      setConsents(Object.fromEntries(statusEntries));
    } catch (e) {
      setError(getUserFriendlyApiError(e, s.loadError));
    } finally {
      setLoading(false);
    }
  }, [s.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveSettings() {
    setSaving(true);
    setError(null);
    try {
      await apiHttp.patch("/integrations/upc/settings", {
        isEnabled: true,
        clientId: clientId.trim() || undefined,
        redirectUri: redirectUri.trim() || undefined,
      });
      await load();
    } catch (e) {
      setError(getUserFriendlyApiError(e, s.saveError));
    } finally {
      setSaving(false);
    }
  }

  async function connectAccount(accountId: string) {
    try {
      const r = await apiHttp.get<{ authorizationUrl: string }>(
        `/integrations/upc/consent/start/${accountId}`,
      );
      if (r.data.authorizationUrl) {
        window.location.href = r.data.authorizationUrl;
      }
    } catch (e) {
      setError(getUserFriendlyApiError(e, s.connectError));
    }
  }

  if (loading) {
    return <p className="p-6 text-sm text-zinc-500">{s.loading}</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <Link href="/settings" className="text-sm text-zinc-500 hover:text-zinc-700">
        {strings.common.backToSettings}
      </Link>
      <h1 className="text-2xl font-semibold text-zinc-900">{s.title}</h1>
      <p className="text-sm text-zinc-600">{s.desc}</p>
      {error && <ErrorPanel message={error} />}

      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-800">{s.apiSection}</h2>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-xs font-medium text-zinc-600">Client ID</label>
            <input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder={settings?.clientIdMasked ?? ""}
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Redirect URI</label>
            <input
              value={redirectUri}
              onChange={(e) => setRedirectUri(e.target.value)}
              className="mt-1 w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <button
            type="button"
            onClick={() => void saveSettings()}
            disabled={saving}
            className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? s.saving : s.save}
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-zinc-800">{s.accountsSection}</h2>
        {accounts.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">
            {s.noAccounts}{" "}
            <Link href="/settings/bank" className="text-blue-600 underline">
              {s.bankLink}
            </Link>
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {accounts.map((acc) => (
              <li key={acc.id} className="flex items-center justify-between py-3">
                <div>
                  <div className="font-medium text-zinc-900">{acc.name}</div>
                  <div className="text-xs text-zinc-500">
                    {acc.iban ?? "—"} · {consents[acc.id]?.status ?? "NONE"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void connectAccount(acc.id)}
                  className="rounded border border-zinc-200 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                >
                  {s.connect}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
