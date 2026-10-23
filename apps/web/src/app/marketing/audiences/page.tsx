"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { strings } from "@/locales";

type Audience = {
  id: string;
  preset: string;
  platform: string;
  title: string;
  hint: string;
  enabled: boolean;
  status: string;
  lastSize: number | null;
  skippedNoContact: number;
  lastError: string | null;
  consentConfirmed: boolean;
  threshold: number | null;
  dormantDays: number;
  canLookalike: boolean;
  lookalikeMode: "create" | "open";
};

const t = strings.marketing;

function statusLabel(status: string): string {
  if (status === "RUNNING" || status === "PENDING") return t.listUpdating;
  if (status === "UPDATED") return t.listUpdated;
  if (status === "FAILED") return t.listFailed;
  if (status === "STOPPED") return t.listStopped;
  return t.listUpdated;
}

export default function MarketingAudiencesPage() {
  const [items, setItems] = useState<Audience[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [threshold, setThreshold] = useState("");
  const [days, setDays] = useState("90");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await apiHttp.get<Audience[] | { items: Audience[] }>("/marketing/audiences");
    setItems(Array.isArray(res.data) ? res.data : res.data.items ?? []);
    setLoaded(true);
  }

  useEffect(() => {
    void load().catch(() => {
      setLoaded(true);
      setError("Не вдалося відкрити списки.");
    });
  }, []);

  async function sync(row: Audience, extra?: { confirmRights?: boolean; force?: boolean }) {
    setError(null);
    try {
      await apiHttp.post(`/marketing/audiences/${row.id}/sync`, {
        confirmRights: extra?.confirmRights ?? false,
        force: extra?.force ?? false,
                  threshold: row.preset === "LARGE_CLIENTS" && threshold ? Number(threshold) : undefined,
        dormantDays: row.preset === "DORMANT" ? Number(days) || 90 : undefined,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалося оновити список.");
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      {!loaded ? <p className="text-sm text-zinc-500">{t.loading}</p> : null}
      {loaded && items.length === 0 ? <p className="text-sm text-zinc-500">{t.emptyAudiences}</p> : null}
      {items.map((row) => (
        <article key={row.id} className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">{row.title}</h2>
              <p className="mt-1 text-sm text-zinc-600">{row.hint}</p>
              <p className="mt-2 text-xs text-zinc-500">
                {row.platform === "META" ? "Meta" : row.platform === "GOOGLE" ? "Google" : "TikTok"} · {statusLabel(row.status)}
                {row.lastSize != null ? ` · ${row.lastSize}` : ""}
              </p>
              {row.lastError ? <p className="mt-2 text-sm text-amber-800">{row.lastError}</p> : null}
              {row.skippedNoContact > 0 ? (
                <p className="mt-1 text-xs text-zinc-500">{t.noContact.replace("{n}", String(row.skippedNoContact))}</p>
              ) : null}
              <p className="mt-1 text-xs text-zinc-500">{row.platform === "META" ? t.minMeta : t.minOther}</p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {row.preset === "LARGE_CLIENTS" ? (
                <input
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  placeholder={t.threshold}
                  className="w-40 rounded-md border border-zinc-200 px-2 py-1 text-sm"
                />
              ) : null}
              {row.preset === "DORMANT" ? (
                <input
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                  placeholder={t.dormantDays}
                  className="w-40 rounded-md border border-zinc-200 px-2 py-1 text-sm"
                />
              ) : null}
              {!row.consentConfirmed ? <p className="max-w-xs text-right text-xs text-zinc-600">{t.consent}</p> : null}
              <button
                type="button"
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white"
                onClick={() => void sync(row, { confirmRights: !row.consentConfirmed })}
              >
                {t.refreshList}
              </button>
              {row.status === "STOPPED" ? (
                <button type="button" className="text-sm underline" onClick={() => void sync(row, { force: true })}>
                  {t.updateAnyway}
                </button>
              ) : null}
              {row.canLookalike && row.lookalikeMode === "create" ? (
                <button
                  type="button"
                  className="text-sm underline"
                  onClick={() => void apiHttp.post(`/marketing/audiences/${row.id}/lookalike`).then(load)}
                >
                  {t.lookalike}
                </button>
              ) : null}
              {row.canLookalike && row.lookalikeMode === "open" ? (
                <button
                  type="button"
                  className="text-sm underline"
                  onClick={() =>
                    void apiHttp
                      .post<{ url?: string }>(`/marketing/audiences/${row.id}/lookalike`)
                      .then((res) => {
                        if (res.data.url) window.open(res.data.url, "_blank", "noopener");
                      })
                  }
                >
                  {t.openCabinet}
                </button>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
