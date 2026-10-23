"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { strings } from "@/locales";
import { money, spendLabel } from "./marketing-format";
import { Filters } from "./marketing-filters";

type Overview = {
  empty: "connect" | "collecting" | null;
  baseCurrency: string;
  period: { from: string; to: string };
  previous: { from: string; to: string };
  windowDays: number;
  spend: number | null;
  spendByCurrency: Array<{ currency: string; amount: number }>;
  leads: number;
  costPerLead: number | null;
  bad: { bad: number; resolved: number; ratio: number | null };
  contactHours: number | null;
  paymentsFromLeads: number | null;
  paymentsInPeriod: number | null;
  roi: number | null;
  roiState: "value" | "too_early" | "no_rate" | "no_spend";
  fxOk: boolean;
  tiles: Array<{ id: string; minimum?: number; previousCost?: number; currentCost?: number; hours?: number; threshold?: number }>;
};

const t = strings.marketing;

function tileText(tile: Overview["tiles"][number], currency: string): string {
  if (tile.id === "cpl") {
    return `Ціна заявки виросла більше ніж утричі до попереднього періоду (${money(tile.previousCost, currency)} → ${money(tile.currentCost, currency)}). Витрати вищі за ${money(tile.minimum, currency)}, оплат із цих заявок немає.`;
  }
  if (tile.id === "spend_no_leads") return "Витрати є, заявок немає.";
  if (tile.id === "slow_contact") {
    return `Перший контакт довший за ${tile.threshold} робочі години. Зараз ${tile.hours} год. Поріг написано тут.`;
  }
  if (tile.id === "junk") return "Серед розібраних більше половини — спам і нецільові, і розібраних не менше 10.";
  if (tile.id === "reconnect") return t.reconnect;
  if (tile.id === "audience_stale") return "Список клієнтів не оновлювався більше 7 днів.";
  return "";
}

export default function MarketingOverviewPage() {
  const [platform, setPlatform] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [windowDays, setWindowDays] = useState(30);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams({ platform, windowDays: String(windowDays) });
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    setError(null);
    apiHttp
      .get<Overview>(`/marketing/overview?${params.toString()}`)
      .then((res) => setData(res.data))
      .catch(() => setError("Не вдалося зібрати огляд."));
  }, [platform, from, to, windowDays]);

  const currency = data?.baseCurrency ?? "";

  return (
    <div className="space-y-4">
      <Filters platform={platform} from={from} to={to} windowDays={windowDays} onPlatform={setPlatform} onFrom={setFrom} onTo={setTo} onWindow={setWindowDays} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {!data ? <p className="text-sm text-zinc-500">{t.loading}</p> : null}
      {data?.empty === "connect" ? (
        <Empty title={t.connect} hint={t.connectHint} href="/settings/marketing" link={t.openSettings} />
      ) : null}
      {data?.empty === "collecting" ? <Empty title={t.collecting} hint="" /> : null}
      {data && !data.empty ? (
        <>
          <p className="text-xs text-zinc-500">
            {t.previous}: {data.previous.from} — {data.previous.to}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi label={t.spend} value={spendLabel(data.spend, data.spendByCurrency, currency)} />
            <Kpi label={t.leads} value={String(data.leads)} />
            <Kpi label={t.costPerLead} value={data.costPerLead == null ? "—" : money(data.costPerLead, currency)} />
            <Kpi
              label={t.badShare}
              value={data.bad.resolved === 0 ? "—" : `${data.bad.bad} / ${data.bad.resolved}`}
            />
            <Kpi
              label={t.contactTime}
              value={data.contactHours == null ? "—" : `${data.contactHours} ${t.hoursShort}`}
              hint={t.contactTimeHint}
            />
            <Kpi label={t.paymentsFromLeads} value={data.paymentsFromLeads == null ? t.noRate : money(data.paymentsFromLeads, currency)} />
            <Kpi label={t.paymentsInPeriod} value={data.paymentsInPeriod == null ? t.noRate : money(data.paymentsInPeriod, currency)} />
            <Kpi label={t.roi} value={roiText(data)} />
          </div>
          {data.tiles.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2">
              {data.tiles.map((tile) => (
                <div key={tile.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                  {tileText(tile, currency)}
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function roiText(data: Overview): string {
  if (data.roiState === "no_spend") return "—";
  if (data.roiState === "too_early") return t.tooEarly;
  if (data.roiState === "no_rate") return t.noRate;
  if (data.roiState === "value" && data.roi != null) return `${data.roi}×`;
  return "—";
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-zinc-900">{value}</div>
      {hint ? <div className="mt-1 text-xs text-zinc-500">{hint}</div> : null}
    </div>
  );
}

function Empty({ title, hint, href, link }: { title: string; hint: string; href?: string; link?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
      <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
      {hint ? <p className="mt-2 text-sm text-zinc-600">{hint}</p> : null}
      {href && link ? (
        <Link href={href} className="mt-4 inline-block text-sm font-medium text-zinc-900 underline">
          {link}
        </Link>
      ) : null}
    </div>
  );
}
