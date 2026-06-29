"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Laptop, Smartphone } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { apiHttp } from "@/lib/api/client";
import {
  presenceApi,
  type PresenceOverviewItem,
  type PresenceSession,
} from "@/lib/api/resources/presence";
import { formatUserRole } from "@/lib/roleLabels";
import { todayYmdInKyiv } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import { KpiCard, SimpleTable } from "@/app/analytics/analytics-ui";

const POLL_MS = 30_000;
const t = strings.monitoring;

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 хв";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} год ${m} хв`;
  return `${m} хв`;
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "—";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return t.lastSeenJustNow;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return t.lastSeenMinutes.replace("{n}", String(mins));
  const hours = Math.floor(mins / 60);
  return t.lastSeenHours.replace("{n}", String(hours));
}

function PlatformBadges({ platforms }: { platforms: PresenceOverviewItem["platforms"] }) {
  if (platforms.length === 0) return <span className="text-zinc-400">—</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {platforms.includes("WEB") ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">
          <Laptop className="h-3 w-3" />
          {t.platformWeb}
        </span>
      ) : null}
      {platforms.includes("MOBILE") ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
          <Smartphone className="h-3 w-3" />
          {t.platformMobile}
        </span>
      ) : null}
    </div>
  );
}

function SessionHistoryPanel({
  userId,
  userName,
  date,
  onClose,
}: {
  userId: string;
  userName: string;
  date: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sessions, setSessions] = useState<PresenceSession[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void presenceApi
      .getUserSessions(userId, date, date)
      .then((data) => {
        if (!cancelled) setSessions(data.sessions);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : t.loadError);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, date]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
      <div className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{t.sessionHistoryTitle}</h2>
            <p className="text-sm text-zinc-500">
              {userName} · {date}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-zinc-200 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
          >
            {strings.common.close}
          </button>
        </div>
        <div className="max-h-[calc(85vh-4rem)] overflow-y-auto p-4">
          {loading ? (
            <p className="text-sm text-zinc-500">{strings.common.loading}</p>
          ) : err ? (
            <p className="text-sm text-red-600">{err}</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-zinc-500">{t.noSessions}</p>
          ) : (
            <div className="space-y-3">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-zinc-900">
                      {session.platform === "WEB" ? t.platformWeb : t.platformMobile}
                    </span>
                    <span className="text-zinc-600">{formatDuration(session.activeSeconds)}</span>
                  </div>
                  <div className="mt-2 grid gap-1 text-zinc-600 sm:grid-cols-2">
                    <div>
                      {t.sessionStart}: {new Date(session.startedAt).toLocaleString("uk-UA")}
                    </div>
                    <div>
                      {t.sessionEnd}: {new Date(session.lastSeenAt).toLocaleString("uk-UA")}
                    </div>
                    <div>
                      {t.location}: {session.location ?? "—"}
                    </div>
                    <div className="truncate" title={session.userAgent ?? undefined}>
                      {t.device}: {session.userAgent ?? "—"}
                    </div>
                  </div>
                  {session.platform === "MOBILE" && session.lat != null && session.lng != null ? (
                    <div className="mt-2">
                      <Link
                        href="/visits/team"
                        className="text-xs font-medium text-sky-700 hover:underline"
                      >
                        {t.openFieldMap}
                      </Link>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MonitoringPage() {
  const [role, setRole] = useState<string | null>(null);
  const [date, setDate] = useState(todayYmdInKyiv());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof presenceApi.getOverview>> | null>(
    null,
  );
  const [selectedUser, setSelectedUser] = useState<PresenceOverviewItem | null>(null);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const load = useCallback(async () => {
    try {
      const data = await presenceApi.getOverview(date);
      setOverview(data);
      setErr(null);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : t.loadError);
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    if (role !== "ADMIN") return;
    setLoading(true);
    void load();
    const timer = setInterval(() => {
      void load();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [role, load]);

  const rows = overview?.items ?? [];
  const totalActiveSeconds = useMemo(
    () => rows.reduce((sum, row) => sum + row.activeSecondsToday, 0),
    [rows],
  );

  if (role !== null && role !== "ADMIN") {
    return (
      <PageShell title={t.pageTitle} subtitle={t.pageSubtitle} icon={Activity}>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-zinc-900">{t.accessDeniedTitle}</h2>
          <p className="mt-2 text-sm text-zinc-600">{t.accessDeniedHint}</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={t.pageTitle}
      subtitle={t.pageSubtitle}
      icon={Activity}
      actions={
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="input-base text-sm"
        />
      }
    >
      {err ? (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KpiCard
          title={t.kpiOnline}
          value={overview ? String(overview.onlineCount) : "—"}
          subtitle={overview ? `${overview.totalUsers} ${t.kpiTotalUsers}` : undefined}
        />
        <KpiCard
          title={t.kpiActiveToday}
          value={loading ? "…" : formatDuration(totalActiveSeconds)}
        />
        <KpiCard title={t.kpiEmployees} value={overview ? String(overview.totalUsers) : "—"} />
      </div>

      <SimpleTable
        rows={rows}
        emptyText={loading ? strings.common.loading : t.noData}
        columns={[
          {
            key: "name",
            title: t.colEmployee,
            render: (row) => (
              <button
                type="button"
                onClick={() => setSelectedUser(row)}
                className="text-left font-medium text-zinc-900 hover:text-sky-700"
              >
                {row.fullName}
              </button>
            ),
          },
          {
            key: "status",
            title: t.colStatus,
            render: (row) => (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
                  row.isOnline ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${row.isOnline ? "bg-emerald-500" : "bg-zinc-400"}`}
                />
                {row.isOnline ? t.statusOnline : t.statusOffline}
              </span>
            ),
          },
          {
            key: "platforms",
            title: t.colDevice,
            render: (row) => <PlatformBadges platforms={row.platforms} />,
          },
          {
            key: "active",
            title: t.colActiveTime,
            render: (row) => formatDuration(row.activeSecondsToday),
          },
          {
            key: "location",
            title: t.colLocation,
            render: (row) => row.location ?? "—",
          },
          {
            key: "lastSeen",
            title: t.colLastSeen,
            render: (row) => formatLastSeen(row.lastSeenAt),
          },
          {
            key: "role",
            title: t.colRole,
            render: (row) => formatUserRole(row.role),
          },
        ]}
      />

      {selectedUser ? (
        <SessionHistoryPanel
          userId={selectedUser.userId}
          userName={selectedUser.fullName}
          date={date}
          onClose={() => setSelectedUser(null)}
        />
      ) : null}
    </PageShell>
  );
}
