"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Target,
} from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { dayPlanApi, type DayPlanPayload } from "@/lib/api/resources/day-plan";
import { DayPlanPercentBadge } from "@/components/day-plan/DayPlanWidget";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { shiftYmdInKyiv, todayYmdInKyiv } from "@/lib/crmDatetime";

type MeResponse = { user?: { role?: string; id?: string } };

function formatPlanFact(item: DayPlanPayload["items"][number]): string {
  if (item.kind === "zero_target") {
    return item.fact === 0 ? "0 прострочених" : `${item.fact} прострочених`;
  }
  if (item.key === "field_shift_started") {
    return item.fact >= 1 ? "Так" : "Ні";
  }
  return `${item.fact} / ${item.plan}`;
}

export default function DayPlanPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <DayPlanContent />
    </Suspense>
  );
}

function DayPlanContent() {
  const searchParams = useSearchParams();
  const queryDate = searchParams.get("date");
  const queryUserId = searchParams.get("userId") ?? undefined;

  const [date, setDate] = useState(() =>
    queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate) ? queryDate : todayYmdInKyiv(),
  );
  const [plan, setPlan] = useState<DayPlanPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | undefined>(queryUserId);

  useEffect(() => {
    if (queryDate && /^\d{4}-\d{2}-\d{2}$/.test(queryDate)) {
      setDate(queryDate);
    }
  }, [queryDate]);

  useEffect(() => {
    if (queryUserId) setUserId(queryUserId);
  }, [queryUserId]);

  useEffect(() => {
    void apiGet<MeResponse>("/auth/me")
      .then((me) => {
        setRole(me.user?.role ?? null);
        if (!queryUserId) setUserId(me.user?.id);
      })
      .catch(() => {
        setRole(null);
      });
  }, [queryUserId]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await dayPlanApi.get({ date, userId });
      setPlan(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPlan(null);
    } finally {
      setLoading(false);
    }
  }, [date, userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !plan) {
    return <PageLoading />;
  }

  if (error && !plan) {
    return <ErrorPanel message={error} onRetry={() => void load()} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
          <Target className="h-7 w-7 text-zinc-600" />
          План на день
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setDate((d) => shiftYmdInKyiv(d, -1))}
            className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50"
            aria-label="Попередній день"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
          <button
            type="button"
            onClick={() => setDate((d) => shiftYmdInKyiv(d, 1))}
            className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50"
            aria-label="Наступний день"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setDate(todayYmdInKyiv())}
            className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          >
            Сьогодні
          </button>
        </div>
      </div>

      {plan && (
        <>
          <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-zinc-900">{plan.fullName}</p>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-zinc-500">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {plan.date} · {plan.profile === "field" ? "Польовий" : "Офісний"} профіль
                </p>
              </div>
              <DayPlanPercentBadge percent={plan.overallPercent} status={plan.status} />
            </div>
            <div className="mt-4 h-3 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className={`h-full rounded-full ${
                  plan.status === "green"
                    ? "bg-emerald-500"
                    : plan.status === "yellow"
                      ? "bg-amber-400"
                      : "bg-red-500"
                }`}
                style={{ width: `${plan.overallPercent}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white shadow-sm">
            <ul className="divide-y divide-zinc-100">
              {plan.items.map((item) => (
                <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900">{item.label}</p>
                    <p className="text-xs text-zinc-500">
                      {formatPlanFact(item)} · вага {item.weight}%
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-sm font-semibold tabular-nums ${
                        item.percent >= 80
                          ? "text-emerald-700"
                          : item.percent >= 50
                            ? "text-amber-700"
                            : "text-red-700"
                      }`}
                    >
                      {item.percent}%
                    </span>
                    <Link
                      href={item.actionHref}
                      className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                    >
                      Перейти
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {role === "LEAD" || role === "ADMIN" ? (
            <p className="text-xs text-zinc-500">
              Для перегляду плану іншого менеджера відкрийте рядок у таблиці «Активність команди» на
              Dashboard.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
