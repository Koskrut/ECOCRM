"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api/client";
import {
  dailyAgendaApi,
  type AgendaPlanItem,
  type DailyAgendaPayload,
} from "@/lib/api/resources/daily-agenda";
import { DailyAgendaEditor, DailyAgendaProgressBar } from "@/components/daily-agenda/DailyAgendaEditor";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { todayYmdInKyiv } from "@/lib/crmDatetime";
import { strings } from "@/locales";

const t = strings.dailyAgenda;

type MeResponse = { user?: { role?: string } };

export default function DailyAgendaPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <DailyAgendaContent />
    </Suspense>
  );
}

function DailyAgendaContent() {
  const [date] = useState(() => todayYmdInKyiv());
  const [agenda, setAgenda] = useState<DailyAgendaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dailyAgendaApi.get({ date });
      setAgenda(data);
      if (data.plan?.status !== "COMMITTED") setEditing(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
    void apiGet<MeResponse>("/auth/me")
      .then((me) => setRole(me.user?.role ?? null))
      .catch(() => setRole(null));
  }, [load]);

  async function saveDraft(items: Parameters<typeof dailyAgendaApi.saveDraft>[0]["items"]) {
    setSaving(true);
    try {
      const data = await dailyAgendaApi.saveDraft({ date, items });
      setAgenda(data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function commit(items: Parameters<typeof dailyAgendaApi.commit>[0]["items"]) {
    setSaving(true);
    try {
      const data = await dailyAgendaApi.commit({ date, items });
      setAgenda(data);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function markDone(item: AgendaPlanItem) {
    if (!item.id) return;
    setSaving(true);
    try {
      const data = await dailyAgendaApi.patchItem(item.id, { status: "DONE" });
      setAgenda(data);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoading />;

  if (error || !agenda) {
    return (
      <div className="mx-auto max-w-3xl p-4">
        <ErrorPanel message={error ?? t.loadFailed} onRetry={() => void load()} />
      </div>
    );
  }

  const initialItems =
    agenda.plan?.items.filter((i) => i.status !== "DISMISSED").map(({ id: _id, completedAt: _c, completedBy: _b, ...rest }) => rest) ??
    agenda.defaultProposal ??
    [];

  const committed = agenda.plan?.status === "COMMITTED";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{t.pageTitle}</h1>
          <p className="text-sm text-zinc-500">
            {date} · {agenda.profile === "field" ? t.profileField : t.profileOffice}
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900">
          {t.backDashboard}
        </Link>
      </div>

      {committed && agenda.completion && !editing ? (
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <DailyAgendaProgressBar completion={agenda.completion} />
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(true)} className="btn-primary text-sm">
              {t.editPlan}
            </button>
            {agenda.profile === "field" ? (
              <Link href={`/visits?date=${date}`} className="rounded-md border border-zinc-200 px-3 py-2 text-sm">
                {t.openRoute}
              </Link>
            ) : (
              <Link href="/work/calls/queue" className="rounded-md border border-zinc-200 px-3 py-2 text-sm">
                {t.openQueue}
              </Link>
            )}
          </div>
        </div>
      ) : null}

      {editing ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <DailyAgendaEditor
            date={date}
            profile={agenda.profile}
            initialItems={initialItems}
            availableSuggestions={agenda.availableSuggestions}
            committedItems={agenda.plan?.items}
            saving={saving}
            onSaveDraft={saveDraft}
            onCommit={commit}
          />
        </div>
      ) : committed ? (
        <ul className="divide-y divide-zinc-100 rounded-xl border border-zinc-200 bg-white shadow-sm">
          {agenda.plan?.items
            .filter((i) => i.status !== "DISMISSED")
            .map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <div className="font-medium text-zinc-900">{item.title}</div>
                  {item.subtitle ? <div className="text-xs text-zinc-500">{item.subtitle}</div> : null}
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <span
                      className={
                        item.status === "DONE"
                          ? "rounded bg-emerald-100 px-2 py-0.5 text-emerald-800"
                          : "rounded bg-zinc-100 px-2 py-0.5 text-zinc-700"
                      }
                    >
                      {item.status === "DONE"
                        ? item.completedBy === "AUTO"
                          ? t.doneAuto
                          : t.done
                        : t.planned}
                    </span>
                    {item.metadata?.actionHref ? (
                      <Link href={item.metadata.actionHref} className="text-sky-700 hover:underline">
                        {t.go}
                      </Link>
                    ) : null}
                  </div>
                </div>
                {item.status === "PLANNED" && role === "MANAGER" ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void markDone(item)}
                    className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs hover:bg-zinc-50"
                  >
                    {t.markDone}
                  </button>
                ) : null}
              </li>
            ))}
        </ul>
      ) : null}

      <p className="mt-4 text-xs text-zinc-500">
        {t.dayPlanHint}{" "}
        <Link href="/work/day-plan" className="text-sky-700 hover:underline">
          {t.dayPlanLink}
        </Link>
      </p>
    </div>
  );
}
