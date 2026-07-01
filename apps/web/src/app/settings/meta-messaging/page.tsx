"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { apiHttp } from "@/lib/api/client";
import { getUserFriendlyApiError } from "@/lib/api/errors";
import { SettingsPageShell } from "@/components/SettingsPageShell";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { strings } from "@/locales";

type MetaMessagingConfig = {
  webhookVerifyToken?: string;
  pageAccessTokenMasked?: string;
  pageId?: string;
  igBusinessAccountId?: string;
  leadCompanyId?: string;
  graphApiVersion?: string;
  publicBaseUrl?: string;
};

function inputClassName() {
  return "mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-semibold text-zinc-900">{children}</h2>;
}

function FieldHint({ children }: { children: React.ReactNode }) {
  return <p className="mt-0.5 text-xs text-zinc-500">{children}</p>;
}

export default function MetaMessagingSettingsPage() {
  const t = strings.settings.metaMessagingPage;

  const [config, setConfig] = useState<MetaMessagingConfig>({});
  const [webhookVerifyToken, setWebhookVerifyToken] = useState("");
  const [pageAccessToken, setPageAccessToken] = useState("");
  const [pageId, setPageId] = useState("");
  const [igBusinessAccountId, setIgBusinessAccountId] = useState("");
  const [leadCompanyId, setLeadCompanyId] = useState("");
  const [graphApiVersion, setGraphApiVersion] = useState("v21.0");
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const webhookUrl = useMemo(() => {
    const base = (publicBaseUrl || config.publicBaseUrl || "").trim().replace(/\/+$/, "");
    return base ? `${base}/integrations/meta/webhook` : "";
  }, [publicBaseUrl, config.publicBaseUrl]);

  const readiness = useMemo(() => {
    const hasPublicUrl = Boolean((publicBaseUrl || config.publicBaseUrl || "").trim());
    const hasVerify = Boolean((webhookVerifyToken || config.webhookVerifyToken || "").trim());
    const hasPageId = Boolean((pageId || config.pageId || "").trim());
    const hasToken = Boolean(config.pageAccessTokenMasked || pageAccessToken.trim());
    const items = [
      { key: "publicUrl", ok: hasPublicUrl, label: t.checks.publicUrl },
      { key: "verifyToken", ok: hasVerify, label: t.checks.verifyToken },
      { key: "pageId", ok: hasPageId, label: t.checks.pageId },
      { key: "pageToken", ok: hasToken, label: t.checks.pageToken },
    ];
    const ready = items.every((item) => item.ok);
    return { items, ready };
  }, [
    publicBaseUrl,
    config.publicBaseUrl,
    webhookVerifyToken,
    config.webhookVerifyToken,
    pageId,
    config.pageId,
    config.pageAccessTokenMasked,
    pageAccessToken,
    t.checks,
  ]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiHttp.get<MetaMessagingConfig>("/settings/meta-messaging");
      const data = res.data ?? {};
      setConfig(data);
      setWebhookVerifyToken(data.webhookVerifyToken ?? "");
      setPageAccessToken("");
      setPageId(data.pageId ?? "");
      setIgBusinessAccountId(data.igBusinessAccountId ?? "");
      setLeadCompanyId(data.leadCompanyId ?? "");
      setGraphApiVersion(data.graphApiVersion ?? "v21.0");
      setPublicBaseUrl(data.publicBaseUrl ?? "");
      if (data.graphApiVersion && data.graphApiVersion !== "v21.0") {
        setShowAdvanced(true);
      }
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.loadError));
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
    setSuccess(null);
    try {
      const body: Record<string, string> = {
        webhookVerifyToken: webhookVerifyToken.trim(),
        pageId: pageId.trim(),
        igBusinessAccountId: igBusinessAccountId.trim(),
        leadCompanyId: leadCompanyId.trim(),
        graphApiVersion: graphApiVersion.trim() || "v21.0",
        publicBaseUrl: publicBaseUrl.trim(),
      };
      if (pageAccessToken !== "") body.pageAccessToken = pageAccessToken;
      const res = await apiHttp.patch<MetaMessagingConfig>("/settings/meta-messaging", body);
      const data = res.data ?? {};
      setConfig(data);
      setWebhookVerifyToken(data.webhookVerifyToken ?? webhookVerifyToken);
      setPageAccessToken("");
      setPageId(data.pageId ?? pageId);
      setIgBusinessAccountId(data.igBusinessAccountId ?? igBusinessAccountId);
      setLeadCompanyId(data.leadCompanyId ?? leadCompanyId);
      setGraphApiVersion(data.graphApiVersion ?? graphApiVersion);
      setPublicBaseUrl(data.publicBaseUrl ?? publicBaseUrl);
      setSuccess(t.saved);
    } catch (e) {
      setError(getUserFriendlyApiError(e, t.saveError));
    } finally {
      setSaving(false);
    }
  }

  async function copyWebhookUrl() {
    if (!webhookUrl) return;
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t.saveError);
    }
  }

  return (
    <SettingsPageShell
      maxWidthClassName="max-w-xl"
      title={t.title}
      subtitle={t.subtitle}
      actions={
        <div className="flex flex-wrap gap-2">
          <Link
            href="/inbox/instagram"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {t.inboxInstagram}
          </Link>
          <Link
            href="/inbox/facebook"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {t.inboxFacebook}
          </Link>
          <a
            href="https://developers.facebook.com/docs/instagram-messaging/overview/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
          >
            {t.docsLink}
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
      }
    >
      {error ? <ErrorPanel variant="inline" message={error} className="mb-4" /> : null}
      {success ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {success}
        </p>
      ) : null}

      {loading ? (
        <PageLoading inline />
      ) : (
        <div className="space-y-5">
          <div
            className={`rounded-lg border p-4 ${
              readiness.ready
                ? "border-emerald-200 bg-emerald-50/80"
                : "border-amber-200 bg-amber-50/80"
            }`}
          >
            <p
              className={`text-sm font-medium ${
                readiness.ready ? "text-emerald-900" : "text-amber-900"
              }`}
            >
              {readiness.ready ? t.ready : t.notReady}
            </p>
            <ul className="mt-3 space-y-2">
              {readiness.items.map((item) => (
                <li key={item.key} className="flex items-center gap-2 text-sm">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      item.ok ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-500"
                    }`}
                    aria-hidden
                  >
                    {item.ok ? <Check className="h-3 w-3" /> : null}
                  </span>
                  <span className={item.ok ? "text-zinc-800" : "text-zinc-600"}>{item.label}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <SectionTitle>{t.sections.meta}</SectionTitle>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">{t.fields.pageId}</label>
                <FieldHint>{t.fields.pageIdHint}</FieldHint>
                <input
                  type="text"
                  inputMode="numeric"
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456789012345"
                  className={inputClassName()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">{t.fields.pageToken}</label>
                <FieldHint>{t.fields.pageTokenHint}</FieldHint>
                <input
                  type="password"
                  value={pageAccessToken}
                  onChange={(e) => setPageAccessToken(e.target.value)}
                  placeholder={
                    config.pageAccessTokenMasked
                      ? `Current: ${config.pageAccessTokenMasked}`
                      : "EAA…"
                  }
                  className={inputClassName()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  {t.fields.igBusinessId}
                </label>
                <FieldHint>{t.fields.igBusinessIdHint}</FieldHint>
                <input
                  type="text"
                  inputMode="numeric"
                  value={igBusinessAccountId}
                  onChange={(e) => setIgBusinessAccountId(e.target.value.replace(/\D/g, ""))}
                  placeholder="17841400000000000"
                  className={inputClassName()}
                />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <SectionTitle>{t.sections.webhook}</SectionTitle>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  {t.fields.verifyToken}
                </label>
                <FieldHint>{t.fields.verifyTokenHint}</FieldHint>
                <input
                  type="text"
                  value={webhookVerifyToken}
                  onChange={(e) => setWebhookVerifyToken(e.target.value)}
                  placeholder="my-verify-token"
                  className={inputClassName()}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700">{t.fields.publicUrl}</label>
                <FieldHint>{t.fields.publicUrlHint}</FieldHint>
                <input
                  type="url"
                  value={publicBaseUrl}
                  onChange={(e) => setPublicBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                  className={inputClassName()}
                />
              </div>
              {webhookUrl ? (
                <div className="rounded-lg bg-zinc-100 px-3 py-2.5">
                  <p className="text-xs font-medium text-zinc-600">{t.webhookUrl}</p>
                  <div className="mt-1 flex items-start gap-2">
                    <code className="min-w-0 flex-1 break-all text-xs text-zinc-800">{webhookUrl}</code>
                    <button
                      type="button"
                      onClick={() => void copyWebhookUrl()}
                      className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      <Copy className="h-3 w-3" aria-hidden />
                      {copied ? t.copied : t.copy}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-zinc-500">{t.subscribeHint}</p>
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-5 shadow-sm">
            <SectionTitle>{t.sections.crm}</SectionTitle>
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700">
                  {t.fields.leadCompanyId}
                </label>
                <FieldHint>{t.fields.leadCompanyIdHint}</FieldHint>
                <input
                  type="text"
                  value={leadCompanyId}
                  onChange={(e) => setLeadCompanyId(e.target.value)}
                  placeholder="Company ID"
                  className={inputClassName()}
                />
              </div>
              <p className="text-xs text-zinc-500">
                {t.leadAdsNote}{" "}
                <Link href="/settings/meta-lead-ads" className="text-blue-600 hover:underline">
                  {t.leadAdsLink}
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-3 text-left text-sm font-semibold text-zinc-800"
            >
              {t.sections.advanced}
              <span className="text-zinc-400">{showAdvanced ? "−" : "+"}</span>
            </button>
            {showAdvanced ? (
              <div className="border-t border-zinc-100 px-5 pb-5 pt-4">
                <label className="block text-sm font-medium text-zinc-700">
                  {t.fields.graphVersion}
                </label>
                <FieldHint>{t.fields.graphVersionHint}</FieldHint>
                <input
                  type="text"
                  value={graphApiVersion}
                  onChange={(e) => setGraphApiVersion(e.target.value)}
                  placeholder="v21.0"
                  className={inputClassName()}
                />
              </div>
            ) : null}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
            >
              {saving ? t.saving : t.save}
            </button>
          </div>
        </div>
      )}
    </SettingsPageShell>
  );
}
