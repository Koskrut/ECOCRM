"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { strings } from "@/locales";

type Account = {
  platform: "META" | "GOOGLE" | "TIKTOK";
  externalAccountId: string;
  name: string;
  currency: string;
  status: string;
  hasKey: boolean;
  spendSource: string;
  qualityConversionActionId: string | null;
  junkConversionActionId: string | null;
  purchaseConversionActionId: string | null;
};

type Draft = {
  externalAccountId: string;
  name: string;
  currency: string;
  accessKey: string;
  spendSource: string;
  qualityConversionActionId: string;
  junkConversionActionId: string;
  purchaseConversionActionId: string;
};

const t = strings.marketing;

const platforms = [
  ["META", "Meta"],
  ["GOOGLE", "Google"],
  ["TIKTOK", "TikTok"],
] as const;

const emptyDraft = (): Draft => ({
  externalAccountId: "",
  name: "",
  currency: "USD",
  accessKey: "",
  spendSource: "api",
  qualityConversionActionId: "",
  junkConversionActionId: "",
  purchaseConversionActionId: "",
});

export default function MarketingSettingsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [lostAsJunk, setLostAsJunk] = useState(false);
  const [windowDays, setWindowDays] = useState(30);
  const [csv, setCsv] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiHttp.get<{ items: Account[]; lostAsJunk: boolean; paymentWindowDays: number }>("/marketing/accounts").then((res) => {
      setAccounts(res.data.items ?? []);
      setLostAsJunk(Boolean(res.data.lostAsJunk));
      setWindowDays(res.data.paymentWindowDays ?? 30);
      const next: Record<string, Draft> = {};
      for (const row of res.data.items ?? []) {
        next[row.platform] = {
          externalAccountId: row.externalAccountId,
          name: row.name,
          currency: row.currency,
          accessKey: "",
          spendSource: row.spendSource,
          qualityConversionActionId: row.qualityConversionActionId ?? "",
          junkConversionActionId: row.junkConversionActionId ?? "",
          purchaseConversionActionId: row.purchaseConversionActionId ?? "",
        };
      }
      setDrafts(next);
    }).catch(() => setMessage("Не вдалося відкрити кабінети."));
  }, []);

  function draft(platform: string): Draft {
    return drafts[platform] ?? emptyDraft();
  }

  async function save(platform: "META" | "GOOGLE" | "TIKTOK") {
    const row = draft(platform);
    setMessage(null);
    await apiHttp.put("/marketing/accounts", {
      platform,
      externalAccountId: row.externalAccountId,
      name: row.name,
      currency: row.currency,
      accessKey: row.accessKey || undefined,
      spendSource: platform === "GOOGLE" ? row.spendSource : "api",
      ...(platform === "GOOGLE"
        ? {
            qualityConversionActionId: row.qualityConversionActionId,
            junkConversionActionId: row.junkConversionActionId,
            purchaseConversionActionId: row.purchaseConversionActionId,
          }
        : {}),
    });
    setMessage("Збережено.");
  }

  async function saveFlags() {
    await apiHttp.put("/marketing/settings", { lostAsJunk, paymentWindowDays: windowDays });
    setMessage("Збережено.");
  }

  async function uploadFile() {
    setMessage(null);
    const res = await apiHttp.post<{ rows: number; days: number }>("/marketing/google/spend-file", { csv });
    setMessage(`Завантажено рядків: ${res.data.rows} за ${res.data.days} дн. Файл замінює ці дні і не додається до підключення.`);
  }

  return (
    <div className="space-y-4">
      <Link href="/settings/meta-lead-ads" className="text-sm text-zinc-800 underline">
        {t.leadAdsLink}
      </Link>
      {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
      {platforms.map(([platform, label]) => {
        const row = draft(platform);
        const saved = accounts.find((item) => item.platform === platform);
        return (
          <section key={platform} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-900">{label}</h2>
            {saved?.status === "NEEDS_RECONNECT" ? <p className="mt-1 text-sm text-amber-800">{t.reconnect}</p> : null}
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              <input value={row.externalAccountId} onChange={(e) => setDrafts({ ...drafts, [platform]: { ...row, externalAccountId: e.target.value } })} placeholder={t.accountId} className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
              <input value={row.name} onChange={(e) => setDrafts({ ...drafts, [platform]: { ...row, name: e.target.value } })} placeholder={t.accountName} className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
              <input value={row.currency} onChange={(e) => setDrafts({ ...drafts, [platform]: { ...row, currency: e.target.value.toUpperCase() } })} placeholder={t.currency} className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
              <input value={row.accessKey} onChange={(e) => setDrafts({ ...drafts, [platform]: { ...row, accessKey: e.target.value } })} placeholder={saved?.hasKey ? t.accessKeySaved : t.accessKey} className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
            </div>
            {platform === "GOOGLE" ? (
              <>
                <div className="mt-3 flex gap-2">
                  <button type="button" onClick={() => setDrafts({ ...drafts, [platform]: { ...row, spendSource: "api" } })} className={`rounded-full px-3 py-1 text-sm ${row.spendSource !== "file" ? "bg-zinc-900 text-white" : "bg-zinc-50 ring-1 ring-zinc-200"}`}>{t.spendFromCabinet}</button>
                  <button type="button" onClick={() => setDrafts({ ...drafts, [platform]: { ...row, spendSource: "file" } })} className={`rounded-full px-3 py-1 text-sm ${row.spendSource === "file" ? "bg-zinc-900 text-white" : "bg-zinc-50 ring-1 ring-zinc-200"}`}>{t.spendFileMode}</button>
                </div>
                <p className="mt-3 text-sm text-zinc-600">{t.googleActionsHint}</p>
                <div className="mt-2 grid gap-2 md:grid-cols-3">
                  <input value={row.qualityConversionActionId} onChange={(e) => setDrafts({ ...drafts, [platform]: { ...row, qualityConversionActionId: e.target.value } })} placeholder={t.qualityAction} className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
                  <input value={row.junkConversionActionId} onChange={(e) => setDrafts({ ...drafts, [platform]: { ...row, junkConversionActionId: e.target.value } })} placeholder={t.junkAction} className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
                  <input value={row.purchaseConversionActionId} onChange={(e) => setDrafts({ ...drafts, [platform]: { ...row, purchaseConversionActionId: e.target.value } })} placeholder={t.purchaseAction} className="rounded-md border border-zinc-200 px-3 py-2 text-sm" />
                </div>
              </>
            ) : null}
            <button type="button" className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white" onClick={() => void save(platform)}>{t.saveAccount}</button>
          </section>
        );
      })}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <label className="flex items-start gap-2 text-sm text-zinc-800">
          <input type="checkbox" checked={lostAsJunk} onChange={(e) => setLostAsJunk(e.target.checked)} className="mt-1" />
          <span>{t.lostAsJunk}</span>
        </label>
        <div className="mt-3 flex gap-2">
          {[7, 30, 90].map((days) => (
            <button key={days} type="button" onClick={() => setWindowDays(days)} className={`rounded-full px-3 py-1 text-sm ${windowDays === days ? "bg-zinc-900 text-white" : "bg-zinc-50 ring-1 ring-zinc-200"}`}>
              {t.window} {days}
            </button>
          ))}
        </div>
        <button type="button" className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white" onClick={() => void saveFlags()}>{t.saveAccount}</button>
      </section>
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="text-base font-semibold">{t.spendFile}</h2>
        <p className="mt-1 text-sm text-zinc-600">{t.spendFileHint}</p>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={6} className="mt-3 w-full rounded-md border border-zinc-200 px-3 py-2 font-mono text-xs" />
        <button type="button" className="mt-3 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white" onClick={() => void uploadFile()}>{t.uploadFile}</button>
      </section>
    </div>
  );
}
