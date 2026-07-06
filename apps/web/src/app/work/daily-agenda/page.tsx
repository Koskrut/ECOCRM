"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/api/client";
import {
  dailyAgendaApi,
  type AgendaPlanItem,
  type DailyAgendaPayload,
} from "@/lib/api/resources/daily-agenda";
import { AgendaItemCard } from "@/components/daily-agenda/AgendaItemCard";
import { AgendaSummaryStrip } from "@/components/daily-agenda/AgendaSummaryStrip";
import { buildAgendaSummaryLinks } from "@/components/daily-agenda/agendaSummaryLinks";
import { DailyAgendaEditor } from "@/components/daily-agenda/DailyAgendaEditor";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { todayYmdInKyiv } from "@/lib/crmDatetime";
import { strings } from "@/locales";

const t = strings.dailyAgenda;

const EMPTY_SUMMARY: DailyAgendaPayload["summary"] = {
  scheduled: { visits: 0, tasks: 0, contactActions: 0 },
  suggestions: {},
  plan: { total: 0, visits: 0, calls: 0, tasks: 0, leads: 0, orders: 0 },
};

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

  useEffect(() => {
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
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

  async function patchItem(item: AgendaPlanItem, status: "DONE" | "DISMISSED") {
    if (!item.id) return;
    setSaving(true);
    try {
      const data = await dailyAgendaApi.patchItem(item.id, { status });
      setAgenda(data);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <PageLoading />;

  if (error || !agenda) {
    return (
      <div className="mx-auto max-w-5xl p-4">
        <ErrorPanel message={error ?? t.loadFailed} onRetry={() => void load()} />
      </div>
    );
  }

  const initialItems =
    agenda.plan?.items.filter((i) => i.status !== "DISMISSED").map(({ id: _id, completedAt: _c, completedBy: _b, ...rest }) => rest) ??
    agenda.defaultProposal ??
    [];

  const committed = agenda.plan?.status === "COMMITTED";
  const summary = agenda.summary ?? EMPTY_SUMMARY;
  const groupedSuggestions = agenda.groupedSuggestions ?? {};
  const canManage = role === "MANAGER";

  const activeItems =
    agenda.plan?.items.filter((i) => i.status === "PLANNED") ?? [];
  const doneItems =
    agenda.plan?.items.filter((i) => i.status === "DONE") ?? [];

  const summaryLinks = buildAgendaSummaryLinks({
    date,
    profile: agenda.profile,
    items: agenda.plan?.items ?? initialItems,
    groupedSuggestions,
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{t.pageTitle}</h1>
        </div>
        <Link href="/dashboard" className="text-sm text-zinc-600 hover:text-zinc-900">
          {t.backDashboard}
        </Link>
      </div>

      {committed && agenda.completion && !editing ? (
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <AgendaSummaryStrip
            summary={summary}
            profile={agenda.profile}
            date={date}
            completion={agenda.completion}
            links={summaryLinks}
          />
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
            groupedSuggestions={groupedSuggestions}
            summary={summary}
            committedItems={agenda.plan?.items}
            completion={agenda.completion}
            saving={saving}
            layout="split"
            onSaveDraft={saveDraft}
            onCommit={commit}
          />
        </div>
      ) : committed ? (
        <div className="space-y-6">
          {activeItems.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {t.activeSection} ({activeItems.length})
              </h2>
              <ul className="space-y-2">
                {activeItems.map((item) => (
                  <li key={item.id}>
                    <AgendaItemCard
                      item={item}
                      saving={saving}
                      onMarkDone={canManage ? () => void patchItem(item, "DONE") : undefined}
                      onDismiss={canManage ? () => void patchItem(item, "DISMISSED") : undefined}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {doneItems.length > 0 ? (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {t.doneSection} ({doneItems.length})
              </h2>
              <ul className="space-y-2 opacity-80">
                {doneItems.map((item) => (
                  <li key={item.id}>
                    <AgendaItemCard item={item} isDone />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
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
