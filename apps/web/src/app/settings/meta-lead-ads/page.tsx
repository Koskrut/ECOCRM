"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type MetaLeadAdsConfig = {
  webhookVerifyToken?: string;
  pageAccessTokenMasked?: string;
  companyId?: string;
};

function getApiErrorMessage(e: unknown, fallback: string) {
  const msg =
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data
      ?.message ??
    (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data?.error;
  return msg ?? (e instanceof Error ? e.message : fallback);
}

export default function MetaLeadAdsSettingsPage() {
  const [config, setConfig] = useState<MetaLeadAdsConfig>({});
  const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<MetaLeadAdsConfig>("/settings/meta-lead-ads");
      const data = res.data ?? {};
      setConfig(data);
      setWebhookVerifyToken(data.webhookVerifyToken ?? "");
      setPageAccessToken("");
      setCompanyId(data.companyId ?? "");
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to load settings"));
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
      const body: Record<string, string> = {
        webhookVerifyToken: webhookVerifyToken.trim(),
        companyId: companyId.trim(),
      };
      if (pageAccessToken !== "") body.pageAccessToken = pageAccessToken;
      const res = await apiHttp.patch<MetaLeadAdsConfig>("/settings/meta-lead-ads", body);
      const data = res.data ?? {};
      setConfig(data);
      setWebhookVerifyToken(data.webhookVerifyToken ?? webhookVerifyToken);
      setPageAccessToken("");
      setCompanyId(data.companyId ?? companyId);
    } catch (e) {
      setError(getApiErrorMessage(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-xl">
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← Back to Settings
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Facebook / Meta Lead Ads</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Configure connection for receiving leads from Meta (Facebook/Instagram) Lead Ads. Set the same Webhook Verify Token in your Meta App. Page Access Token is used to fetch lead details from Graph API if needed.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Webhook Verify Token
                </label>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Enter the same value in Meta App → Webhooks → Edit subscription → Verify Token
                </p>
                <input
                  type="text"
                  value={webhookVerifyToken}
                  onChange={(e) => setWebhookVerifyToken(e.target.value)}
                  placeholder="e.g. my-verify-token"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Page Access Token
                </label>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Optional. Leave empty to keep current. Used to fetch lead field data from Graph API.
                </p>
                <input
                  type="password"
                  value={pageAccessToken}
                  onChange={(e) => setPageAccessToken(e.target.value)}
                  placeholder={config.pageAccessTokenMasked ? `Current: ${config.pageAccessTokenMasked}` : "Paste token"}
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  Default company ID (optional)
                </label>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Override META_LEAD_COMPANY_ID: new leads will be assigned to this company. Leave empty to use env or first company.
                </p>
                <input
                  type="text"
                  value={companyId}
                  onChange={(e) => setCompanyId(e.target.value)}
                  placeholder="Company ID"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
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
          </div>
        )}
      </div>
    </div>
  );
}
