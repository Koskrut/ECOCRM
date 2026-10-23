"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { strings } from "@/locales";

type LinkRow = {
  id: string;
  name: string;
  channel: string;
  leads: number;
  countsAsCampaign: boolean;
  fullUrl: string;
};

type Choice = { platform: string; externalId: string; name: string };

const t = strings.marketing;

const channels = [
  ["FACEBOOK", t.channels.facebook],
  ["INSTAGRAM", t.channels.instagram],
  ["GOOGLE", t.channels.google],
  ["TIKTOK", t.channels.tiktok],
  ["OTHER", t.channels.other],
] as const;

export default function MarketingLinksPage() {
  const [items, setItems] = useState<LinkRow[]>([]);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [channel, setChannel] = useState<(typeof channels)[number][0]>("FACEBOOK");
  const [name, setName] = useState("");
  const [campaign, setCampaign] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [links, campaigns] = await Promise.all([
      apiHttp.get<LinkRow[] | { items: LinkRow[] }>("/marketing/links"),
      apiHttp.get<Choice[] | { items: Choice[] }>("/marketing/links/campaigns"),
    ]);
    setItems(Array.isArray(links.data) ? links.data : links.data.items ?? []);
    setChoices(Array.isArray(campaigns.data) ? campaigns.data : campaigns.data.items ?? []);
  }

  useEffect(() => {
    void load().catch(() => setError("Не вдалося відкрити посилання."));
  }, []);

  async function create() {
    setError(null);
    const [platform, externalId] = campaign.split(":");
    try {
      await apiHttp.post("/marketing/links", {
        channel,
        name,
        campaignExternalId: externalId || undefined,
        campaignPlatform: platform || undefined,
      });
      setName("");
      setCampaign("");
      await load();
    } catch {
      setError("Не вдалося створити посилання.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {channels.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setChannel(id)}
              className={`rounded-full px-3 py-1.5 text-sm ${channel === id ? "bg-zinc-900 text-white" : "bg-zinc-50 text-zinc-700 ring-1 ring-zinc-200"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t.linkName}
            className="min-w-48 flex-1 rounded-md border border-zinc-200 px-3 py-2 text-sm"
          />
          <select value={campaign} onChange={(e) => setCampaign(e.target.value)} className="rounded-md border border-zinc-200 px-2 py-2 text-sm">
            <option value="">{t.linkCampaignEmpty}</option>
            {choices.map((choice) => (
              <option key={`${choice.platform}:${choice.externalId}`} value={`${choice.platform}:${choice.externalId}`}>
                {choice.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={!name.trim()} onClick={() => void create()} className="rounded-md bg-zinc-900 px-3 py-2 text-sm text-white disabled:opacity-40">
            {t.saveLink}
          </button>
        </div>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      </div>
      {items.length === 0 ? <p className="text-sm text-zinc-500">{t.emptyLinks}</p> : null}
      {items.map((row) => (
        <article key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4">
          <div>
            <div className="font-medium text-zinc-900">{row.name}</div>
            <div className="text-xs text-zinc-500">
              {channels.find((item) => item[0] === row.channel)?.[1] ?? row.channel} · {t.linkLeads}: {row.leads}
            </div>
            {!row.countsAsCampaign ? <div className="mt-1 text-xs text-zinc-500">{t.linkCampaignEmpty}</div> : null}
          </div>
          <div className="flex gap-3">
            <button type="button" className="text-sm underline" onClick={() => void navigator.clipboard.writeText(row.fullUrl)}>
              {t.copyLink}
            </button>
            <button
              type="button"
              className="text-sm text-zinc-500 underline"
              onClick={() => void apiHttp.delete(`/marketing/links/${row.id}`).then(load)}
            >
              Прибрати
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
