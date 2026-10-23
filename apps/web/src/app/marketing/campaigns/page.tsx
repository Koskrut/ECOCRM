"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { ModuleIds } from "@/lib/modules/module-ids";
import { useModules } from "@/lib/modules/useModules";
import { strings } from "@/locales";
import { money, spendLabel } from "../marketing-format";
import { Filters } from "../marketing-filters";

type Campaign = {
  platform: string;
  externalId: string;
  name: string;
  status: string;
  spend: number | null;
  spendByCurrency: Array<{ currency: string; amount: number }>;
  leads: number;
  costPerLead: number | null;
  bad: { bad: number; resolved: number };
  contactHours: number | null;
  paymentsFromLeads: number | null;
  roi: number | null;
  roiState: string;
  openUrl: string | null;
};

type Detail = {
  ads: Array<{ externalId: string; name: string; status: string; leads: number; spendByCurrency: Array<{ currency: string; amount: number }> }>;
  leads: Array<{ id: string; name: string; stage: string; status: string }>;
};

const t = strings.marketing;

function statusLabel(status: string): string {
  if (status === "ACTIVE") return t.showing;
  if (status === "PAUSED") return t.paused;
  if (status === "COMPLETED") return t.finished;
  return "—";
}

function openLabel(platform: string): string {
  if (platform === "GOOGLE") return t.openInGoogle;
  if (platform === "TIKTOK") return t.openInTiktok;
  return t.openInMeta;
}

function roiText(row: Campaign): string {
  if (row.roiState === "no_spend") return "—";
  if (row.roiState === "too_early") return t.tooEarly;
  if (row.roiState === "no_rate") return t.noRate;
  if (row.roi != null) return `${row.roi}×`;
  return "—";
}

export default function MarketingCampaignsPage() {
  const [platform, setPlatform] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [windowDays, setWindowDays] = useState(30);
  const [items, setItems] = useState<Campaign[]>([]);
  const [currency, setCurrency] = useState("USD");
  const [hasCabinet, setHasCabinet] = useState<boolean | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [aiCampaigns, setAiCampaigns] = useState<Array<{ id: string; name: string }>>([]);
  const [aiChoice, setAiChoice] = useState("");
  const [aiCount, setAiCount] = useState<number | null>(null);
  const { status, effective } = useModules();
  const aiEnabled = status === "ready" && effective(ModuleIds.VoiceOutbound);

  useEffect(() => {
    apiHttp
      .get<{ items: Array<{ status: string }> }>("/marketing/accounts")
      .then((res) => {
        setHasCabinet((res.data.items ?? []).some((account) => account.status !== "DISABLED"));
      })
      .catch(() => setHasCabinet(false));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ platform, windowDays: String(windowDays) });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    apiHttp.get<{ items: Campaign[]; baseCurrency: string }>(`/marketing/campaigns?${params}`).then((res) => {
      setItems(res.data.items ?? []);
      setCurrency(res.data.baseCurrency);
    }).catch(() => setItems([]));
  }, [platform, from, to, windowDays]);

  async function toggle(row: Campaign) {
    const key = `${row.platform}:${row.externalId}`;
    if (open === key) {
      setOpen(null);
      setDetail(null);
      return;
    }
    setOpen(key);
    setAiCount(null);
    const params = new URLSearchParams({ windowDays: String(windowDays) });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const res = await apiHttp.get<Detail>(`/marketing/campaigns/${row.platform}/${encodeURIComponent(row.externalId)}?${params}`);
    setDetail({ ads: res.data.ads ?? [], leads: res.data.leads ?? [] });
    if (aiEnabled) {
      const campaigns = await apiHttp.get<Array<{ id: string; name: string }>>("/marketing/ai-calls/campaigns");
      setAiCampaigns(campaigns.data ?? []);
      setAiChoice(campaigns.data?.[0]?.id ?? "");
    }
  }

  async function preview(row: Campaign) {
    if (!aiChoice) return;
    const res = await apiHttp.post<{ count: number }>("/marketing/ai-calls/preview", {
      outboundCampaignId: aiChoice,
      platform: row.platform,
      campaignExternalId: row.externalId,
    });
    setAiCount(res.data.count);
  }

  async function enqueue(row: Campaign) {
    if (!aiChoice) return;
    await apiHttp.post("/marketing/ai-calls/enqueue", {
      outboundCampaignId: aiChoice,
      platform: row.platform,
      campaignExternalId: row.externalId,
    });
    await preview(row);
  }

  if (hasCabinet !== true) {
    return (
      <div className="space-y-4">
        <Filters platform={platform} from={from} to={to} windowDays={windowDays} onPlatform={setPlatform} onFrom={setFrom} onTo={setTo} onWindow={setWindowDays} />
        {hasCabinet === null ? (
          <p className="text-sm text-zinc-500">{t.loading}</p>
        ) : (
          <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
            <h2 className="text-lg font-semibold text-zinc-900">{t.connect}</h2>
            <p className="mt-2 text-sm text-zinc-600">{t.connectHint}</p>
            <Link href="/settings/marketing" className="mt-4 inline-block text-sm font-medium text-zinc-900 underline">
              {t.openSettings}
            </Link>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Filters platform={platform} from={from} to={to} windowDays={windowDays} onPlatform={setPlatform} onFrom={setFrom} onTo={setTo} onWindow={setWindowDays} />
      {items.length === 0 ? <p className="text-sm text-zinc-500">{t.emptyCampaigns}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="px-3 py-2">{t.tabs.campaigns}</th>
              <th className="px-3 py-2">{t.platformColumn}</th>
              <th className="px-3 py-2">{t.spend}</th>
              <th className="px-3 py-2">{t.leads}</th>
              <th className="px-3 py-2">{t.costPerLead}</th>
              <th className="px-3 py-2">{t.badShare}</th>
              <th className="px-3 py-2">{t.contactTime}</th>
              <th className="px-3 py-2">{t.paymentsFromLeads}</th>
              <th className="px-3 py-2">{t.roi}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const key = `${row.platform}:${row.externalId}`;
              return (
                <Fragment key={key}>
                  <tr className="cursor-pointer border-t border-zinc-100" onClick={() => void toggle(row)}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-zinc-900">{row.name}</div>
                      <div className="text-xs text-zinc-500">{statusLabel(row.status)}</div>
                    </td>
                    <td className="px-3 py-2">{row.platform === "META" ? "Meta" : row.platform === "GOOGLE" ? "Google" : "TikTok"}</td>
                    <td className="px-3 py-2">{spendLabel(row.spend, row.spendByCurrency, currency)}</td>
                    <td className="px-3 py-2">{row.leads}</td>
                    <td className="px-3 py-2">{row.costPerLead == null ? "—" : money(row.costPerLead, currency)}</td>
                    <td className="px-3 py-2">{row.bad.resolved ? `${row.bad.bad}/${row.bad.resolved}` : "—"}</td>
                    <td className="px-3 py-2">{row.contactHours == null ? "—" : `${row.contactHours} ${t.hoursShort}`}</td>
                    <td className="px-3 py-2">{row.paymentsFromLeads == null ? t.noRate : money(row.paymentsFromLeads, currency)}</td>
                    <td className="px-3 py-2">{roiText(row)}</td>
                  </tr>
                  {open === key && detail ? (
                    <tr key={`${key}-detail`} className="border-t border-zinc-100 bg-zinc-50">
                      <td colSpan={9} className="px-3 py-3">
                        <div className="mb-3 flex flex-wrap items-center gap-3">
                          {row.openUrl ? (
                            <a href={row.openUrl} target="_blank" rel="noreferrer" className="text-sm underline">
                              {openLabel(row.platform)}
                            </a>
                          ) : null}
                          {aiEnabled ? (
                            <>
                              <select value={aiChoice} onChange={(e) => setAiChoice(e.target.value)} className="rounded-md border border-zinc-200 px-2 py-1 text-sm">
                                {aiCampaigns.length === 0 ? <option value="">{t.aiEmpty}</option> : null}
                                {aiCampaigns.map((campaign) => (
                                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                                ))}
                              </select>
                              <button type="button" className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white" onClick={() => void preview(row)}>
                                {t.transferAi}
                              </button>
                              {aiCount != null ? <span className="text-sm">{t.peopleCount.replace("{n}", String(aiCount))}</span> : null}
                              {aiCount != null && aiCount > 0 ? (
                                <button type="button" className="text-sm underline" onClick={() => void enqueue(row)}>
                                  {t.confirmTransfer}
                                </button>
                              ) : null}
                            </>
                          ) : null}
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div>
                            <div className="mb-1 text-xs font-medium text-zinc-500">{t.ads}</div>
                            {detail.ads.map((ad) => (
                              <div key={ad.externalId} className="flex justify-between gap-2 border-t border-zinc-200 py-1 text-sm">
                                <span>{ad.name}</span>
                                <span className="text-zinc-500">{statusLabel(ad.status)} · {t.leads} {ad.leads}</span>
                              </div>
                            ))}
                          </div>
                          <div>
                            <div className="mb-1 text-xs font-medium text-zinc-500">{t.leads}</div>
                            {detail.leads.map((lead) => (
                              <div key={lead.id} className="flex justify-between gap-2 border-t border-zinc-200 py-1 text-sm">
                                <span>{lead.name}</span>
                                <span className="text-zinc-500">{lead.stage}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
