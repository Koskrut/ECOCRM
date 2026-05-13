"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { leadsApi } from "@/lib/api/resources/leads";

type MetaLeadAdsConfig = {
  webhookVerifyToken?: string;
  pageAccessTokenMasked?: string;
  companyId?: string;
  fbPixelId?: string;
};

export default function MetaLeadAdsSettingsPage() {
  const [config, setConfig] = useState<MetaLeadAdsConfig>({});
  const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [fbPixelId, setFbPixelId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [syncFormId, setSyncFormId] = useState("");
  const [syncSince, setSyncSince] = useState("");
  const [syncUntil, setSyncUntil] = useState("");
  const [syncPageSize, setSyncPageSize] = useState("100");
  const [syncMaxPages, setSyncMaxPages] = useState("200");
  const [syncDryRun, setSyncDryRun] = useState(true);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

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
      setError(getUserFriendlyApiError(e, "Не вдалося завантажити налаштування."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function runMetaFormSync() {
    const formId = syncFormId.trim();
    if (!formId) {
      setError("Enter Lead form ID (formId) to sync");
      return;
    }
    const pageSize = Number.parseInt(syncPageSize, 10);
    const maxPages = Number.parseInt(syncMaxPages, 10);
    if (!Number.isFinite(pageSize) || pageSize < 1 || pageSize > 200) {
      setError("Page size must be between 1 and 200");
      return;
    }
    if (!Number.isFinite(maxPages) || maxPages < 1 || maxPages > 5000) {
      setError("Max pages must be between 1 and 5000");
      return;
    }

    setSyncBusy(true);
    setError(null);
    setSyncMessage(null);
    try {
      const since =
        syncSince.trim() === "" ? undefined : new Date(syncSince).toISOString();
      const until =
        syncUntil.trim() === "" ? undefined : new Date(syncUntil).toISOString();
      const data = await leadsApi.metaSyncForm({
        formId,
        since,
        until,
        pageSize,
        maxPages,
        dryRun: syncDryRun,
      });
      const errPart =
        data.errors.length > 0
          ? ` Помилки: ${data.errors.length} запит(ів) завершилися невдало (деталі дивіться в логах API).`
          : "";
      setSyncMessage(
        syncDryRun
          ? `Тестовий запуск: отримано ${data.leadsFetched} лідів із ${data.pagesFetched} сторінок.${errPart}`
          : `Імпортовано нових: ${data.persistedCreated}, об'єднано/пропущено: ${data.persistedDeduped} (за phone/email/Meta ID). Отримано ${data.leadsFetched} лідів із ${data.pagesFetched} сторінок.${errPart}`,
      );
    } catch (e) {
      setError(getUserFriendlyApiError(e, "Синхронізацію не виконано."));
    } finally {
      setSyncBusy(false);
    }
  }

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
      setError(getUserFriendlyApiError(e, "Не вдалося зберегти налаштування."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 p-6">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <Link
            href="/settings"
            className="inline-flex items-center text-sm text-zinc-600 hover:text-zinc-900"
          >
            ← До налаштувань
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-zinc-900">Facebook / Meta Lead Ads</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Configure connection for receiving leads from Meta (Facebook/Instagram) Lead Ads, and optional Meta Pixel for analytics on this CRM. In Meta App → Webhooks, set callback URL to{" "}
            <code className="rounded bg-zinc-100 px-1">https://&lt;your-api-host&gt;/leads/meta/ingest</code>{" "}
            (GET for verification, POST for events). Use the same Webhook Verify Token here.             Page Access Token loads lead field data from Graph API when the webhook payload has no fields, and is required for the bulk “sync form” tool below. Set{" "}
            <code className="rounded bg-zinc-100 px-1">META_APP_SECRET</code> on the API server to verify webhook signatures.
          </p>
        </div>

        {error && (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        {syncMessage && (
          <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
            {syncMessage}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-zinc-500">Завантаження...</p>
        ) : (
          <>
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

          <div className="mt-6 rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-zinc-900">Import leads from a form</h2>
            <p className="mt-1 text-xs text-zinc-500">
              Fetches all leads for a Meta Lead Ads form via Graph API (<code className="rounded bg-zinc-100 px-1">GET /&#123;form_id&#125;/leads</code>).
              Requires a saved <strong>Page Access Token</strong> with lead retrieval permissions.{" "}
              <strong>Admin only.</strong> Run a dry run first, then uncheck to write into CRM. Safe to re-run (dedupe by Meta lead ID).
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">Lead form ID</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={syncFormId}
                  onChange={(e) => setSyncFormId(e.target.value.replace(/\D/g, ""))}
                  placeholder="e.g. 123456789012345"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Since (optional)</label>
                  <input
                    type="datetime-local"
                    value={syncSince}
                    onChange={(e) => setSyncSince(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Until (optional)</label>
                  <input
                    type="datetime-local"
                    value={syncUntil}
                    onChange={(e) => setSyncUntil(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Page size</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={syncPageSize}
                    onChange={(e) => setSyncPageSize(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-700">Max pages (safety cap)</label>
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={syncMaxPages}
                    onChange={(e) => setSyncMaxPages(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
                  />
                </div>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={syncDryRun}
                  onChange={(e) => setSyncDryRun(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                Dry run (count only, do not create leads)
              </label>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => void runMetaFormSync()}
                disabled={syncBusy}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
              >
                {syncBusy ? "Running…" : syncDryRun ? "Run dry run" : "Import leads"}
              </button>
            </div>
          </div>
          </>
        )}
      </div>
    </div>
  );
}
