"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";

type MetaLeadAdsConfig = {
  webhookVerifyToken?: string;
  pageAccessTokenMasked?: string;
  companyId?: string;
  fbPixelId?: string;
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
  const [fbPixelId, setFbPixelId] = useState("");
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
      setFbPixelId(data.fbPixelId ?? "");
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
        fbPixelId: fbPixelId.trim(),
      };
      if (pageAccessToken !== "") body.pageAccessToken = pageAccessToken;
      const res = await apiHttp.patch<MetaLeadAdsConfig>("/settings/meta-lead-ads", body);
      const data = res.data ?? {};
      setConfig(data);
      setWebhookVerifyToken(data.webhookVerifyToken ?? webhookVerifyToken);
      setPageAccessToken("");
      setCompanyId(data.companyId ?? companyId);
      setFbPixelId(data.fbPixelId ?? fbPixelId);
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
            Configure connection for receiving leads from Meta (Facebook/Instagram) Lead Ads, and optional Meta Pixel for analytics on this CRM. In Meta App → Webhooks, set callback URL to{" "}
            <code className="rounded bg-zinc-100 px-1">https://&lt;your-api-host&gt;/leads/meta/ingest</code>{" "}
            (GET for verification, POST for events). Use the same Webhook Verify Token here. Page Access Token loads lead field data from Graph API when the webhook payload has no fields. Set{" "}
            <code className="rounded bg-zinc-100 px-1">META_APP_SECRET</code> on the API server to verify webhook signatures.
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
                  Meta Pixel ID (optional)
                </label>
                <p className="mt-0.5 text-xs text-zinc-500">
                  Numeric ID from Events Manager. Loads the pixel on all CRM pages. Leave empty to disable, or set{" "}
                  <code className="rounded bg-zinc-100 px-1">FB_PIXEL_ID</code> /{" "}
                  <code className="rounded bg-zinc-100 px-1">NEXT_PUBLIC_FB_PIXEL_ID</code> as fallback.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={fbPixelId}
                  onChange={(e) => setFbPixelId(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 123456789012345"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
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
