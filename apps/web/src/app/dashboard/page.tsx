"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet } from "@/lib/api/client";
import {
  LayoutDashboard,
  Package,
  TrendingUp,
  UserPlus,
  Percent,
  Wallet,
  ListTodo,
  Phone,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { tasksApi, type Task } from "@/lib/api/resources/tasks";
import { dayPlanApi, type DayPlanPayload } from "@/lib/api/resources/day-plan";
import { dailyAgendaApi, type DailyAgendaPayload } from "@/lib/api/resources/daily-agenda";
import { DayPlanPercentBadge, DayPlanWidget } from "@/components/day-plan/DayPlanWidget";
import { DailyAgendaWidget } from "@/components/daily-agenda/DailyAgendaWidget";
import { MorningPlanModal } from "@/components/daily-agenda/MorningPlanModal";
import { DateTime } from "luxon";
import { ErrorPanel, PageLoading } from "@/components/feedback";
import { baseCurrencySymbol } from "@/lib/base-currency";
import {
  CRM_LOCALE,
  CRM_TIME_ZONE,
  shiftYmdInKyiv,
  todayYmdInKyiv,
} from "@/lib/crmDatetime";

type DailyTeamActivityRow = {
  userId: string;
  fullName: string;
  callsInbound: number;
  callsOutbound: number;
  visits: number;
  ordersCount: number;
  ordersAmount: number;
  paymentsAmount: number;
  dayPlanPercent: number;
  dayPlanStatus: "green" | "yellow" | "red";
};

type DailyTeamActivityPayload = {
  date: string;
  currency?: string;
  rows: DailyTeamActivityRow[];
};

type DashboardStats = {
  kpi: {
    ordersCount: number;
    revenue: number;
    leadsCount: number;
    leadsConversionPercent: number;
    debtTotal: number;
  };
  ordersByStage: { orderStage: string; count: number }[];
  leadsByStatus: { status: string; count: number }[];
  leadsBySource: { source: string; count: number }[];
  revenueByDay: { date: string; totalAmount: number; count: number }[];
};

/** Logical funnel order for charts (matches main order board). */
const ORDER_STAGE_CHART_ORDER: string[] = [
  "NEW",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
  "CANCELED",
  "REFUSED",
  "RETURN_IN_PROGRESS",
];

const ORDER_STAGE_LABELS: Record<string, string> = {
  NEW: "Новий",
  CONFIRMED: "Підтверджено",
  AWAITING_PAYMENT: "Очікує оплату",
  AWAITING_STOCK: "Очікує на склад",
  READY_TO_SHIP: "Готово до відправки",
  SHIPPED: "Відправлено",
  AWAITING_RECEIPT: "Очікує отримання",
  RECEIVED: "Отримано",
  COMPLETED: "Завершено",
  CANCELED: "Скасовано",
  REFUSED: "Відмова",
  RETURN_IN_PROGRESS: "Повернення",
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  IN_PROGRESS: "In progress",
  WON: "Won",
  NOT_TARGET: "Not target",
  LOST: "Lost",
};

const LEAD_SOURCE_LABELS: Record<string, string> = {
  FACEBOOK: "Facebook",
  TELEGRAM: "Telegram",
  INSTAGRAM: "Instagram",
  WEBSITE: "Website",
  OTHER: "Other",
};

/* Same palette as app buttons: accent gradient #0ea5e9 → #06b6d4 and related shades */
const CHART_COLORS = [
  "#0ea5e9",
  "#06b6d4",
  "#0284c7",
  "#0891b2",
  "#0c4a6e",
  "#155e75",
  "#0369a1",
  "#22d3ee",
];

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "decimal",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatShortDate(dateStr: string): string {
  const dt = DateTime.fromISO(dateStr, { zone: CRM_TIME_ZONE }).setLocale(CRM_LOCALE);
  if (!dt.isValid) return dateStr;
  return dt.toLocaleString({ month: "short", day: "numeric" });
}

function formatTaskDue(dueAt: string | null | undefined): string {
  if (!dueAt) return "—";
  const d = DateTime.fromISO(dueAt, { setZone: true }).setZone(CRM_TIME_ZONE);
  if (!d.isValid) return "—";
  const now = DateTime.now().setZone(CRM_TIME_ZONE);
  const dDay = d.toISODate();
  const today = now.toISODate();
  const tomorrow = now.plus({ days: 1 }).toISODate();
  if (dDay === today) return "Today";
  if (dDay === tomorrow) return "Tomorrow";
  return d.setLocale(CRM_LOCALE).toLocaleString({ day: "numeric", month: "short" });
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

  const [activityDate, setActivityDate] = useState(() => todayYmdInKyiv());
  const [activity, setActivity] = useState<DailyTeamActivityPayload | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState<string | null>(null);

  const [dayPlan, setDayPlan] = useState<DayPlanPayload | null>(null);
  const [dayPlanLoading, setDayPlanLoading] = useState(true);
  const [dayPlanError, setDayPlanError] = useState<string | null>(null);

  const [agenda, setAgenda] = useState<DailyAgendaPayload | null>(null);
  const [agendaLoading, setAgendaLoading] = useState(true);
  const [agendaError, setAgendaError] = useState<string | null>(null);
  const [morningOpen, setMorningOpen] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const loadTasks = useCallback(async () => {
    setTasksLoading(true);
    try {
      const res = await tasksApi.list({
        status: ["OPEN", "IN_PROGRESS"],
        pageSize: 10,
      });
      setTasks(res.items);
    } catch {
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const completeTask = useCallback(
    async (id: string) => {
      try {
        await tasksApi.complete(id);
        await loadTasks();
      } catch {
        // ignore
      }
    },
    [loadTasks],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<DashboardStats>("/dashboard/stats", { period });
      setData(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  const loadActivity = useCallback(async () => {
    setActivityLoading(true);
    setActivityError(null);
    try {
      const res = await apiGet<DailyTeamActivityPayload>("/dashboard/daily-team-activity", {
        date: activityDate,
      });
      setActivity(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setActivityError(msg);
      setActivity(null);
    } finally {
      setActivityLoading(false);
    }
  }, [activityDate]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  const loadDayPlan = useCallback(async () => {
    setDayPlanLoading(true);
    setDayPlanError(null);
    try {
      const res = await dayPlanApi.get({ date: todayYmdInKyiv() });
      setDayPlan(res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setDayPlanError(msg);
      setDayPlan(null);
    } finally {
      setDayPlanLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDayPlan();
  }, [loadDayPlan]);

  const loadAgenda = useCallback(async () => {
    setAgendaLoading(true);
    setAgendaError(null);
    try {
      const res = await dailyAgendaApi.get({ date: todayYmdInKyiv() });
      setAgenda(res);
      return res;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setAgendaError(msg);
      setAgenda(null);
      return null;
    } finally {
      setAgendaLoading(false);
    }
  }, []);

  useEffect(() => {
    void apiGet<{ user?: { role?: string } }>("/auth/me")
      .then((me) => setUserRole(me.user?.role ?? null))
      .catch(() => setUserRole(null));
    void loadAgenda();
  }, [loadAgenda]);

  useEffect(() => {
    if (userRole === "MANAGER" && agenda?.plan?.status !== "COMMITTED") {
      setMorningOpen(true);
    }
  }, [userRole, agenda?.plan?.status]);

  const activityRowsSorted = useMemo(() => {
    const rows = activity?.rows ?? [];
    return [...rows].sort((a, b) => a.dayPlanPercent - b.dayPlanPercent);
  }, [activity?.rows]);

  const showTeamDayPlan = (activity?.rows?.length ?? 0) > 1;

  if (loading && !data) {
    return <PageLoading />;
  }

  if (error && !data) {
    return <ErrorPanel message={error} onRetry={() => void load()} />;
  }

  const kpi = data?.kpi ?? {
    ordersCount: 0,
    revenue: 0,
    leadsCount: 0,
    leadsConversionPercent: 0,
    debtTotal: 0,
  };
  const ordersByStage = data?.ordersByStage ?? [];
  const leadsByStatus = data?.leadsByStatus ?? [];
  const leadsBySource = data?.leadsBySource ?? [];
  const revenueByDay = data?.revenueByDay ?? [];

  const ordersByStageDisplay = [...ordersByStage]
    .sort((a, b) => {
      const ia = ORDER_STAGE_CHART_ORDER.indexOf(a.orderStage);
      const ib = ORDER_STAGE_CHART_ORDER.indexOf(b.orderStage);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    })
    .map((r) => ({
      name: ORDER_STAGE_LABELS[r.orderStage] ?? r.orderStage,
      count: r.count,
    }));
  const leadsByStatusDisplay = leadsByStatus.map((r) => ({
    name: LEAD_STATUS_LABELS[r.status] ?? r.status,
    value: r.count,
  }));
  const leadsBySourceDisplay = leadsBySource.map((r) => ({
    name: LEAD_SOURCE_LABELS[r.source] ?? r.source,
    value: r.count,
  }));
  const revenueByDayDisplay = revenueByDay.map((r) => ({
    date: formatShortDate(r.date),
    totalAmount: r.totalAmount,
    orders: r.count,
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-zinc-900">
          <LayoutDashboard className="h-7 w-7 text-zinc-600" />
          Dashboard
        </h1>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as "week" | "month")}
          className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        >
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500">
            <Package className="h-4 w-4" />
            <span className="text-sm font-medium">Orders</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{kpi.ordersCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500">
            <TrendingUp className="h-4 w-4" />
            <span className="text-sm font-medium">Revenue</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {formatMoney(kpi.revenue)}
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500">
            <UserPlus className="h-4 w-4" />
            <span className="text-sm font-medium">Leads</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">{kpi.leadsCount}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500">
            <Percent className="h-4 w-4" />
            <span className="text-sm font-medium">Lead conversion</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {kpi.leadsConversionPercent}%
          </p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-2 text-zinc-500">
            <Wallet className="h-4 w-4" />
            <span className="text-sm font-medium">Debt</span>
          </div>
          <p className="mt-1 text-2xl font-semibold text-zinc-900">
            {formatMoney(kpi.debtTotal)}
          </p>
        </div>
      </div>

      <DayPlanWidget
        plan={dayPlan}
        loading={dayPlanLoading}
        error={dayPlanError}
        detailHref="/work/day-plan"
      />

      <DailyAgendaWidget
        agenda={agenda}
        loading={agendaLoading}
        error={agendaError}
        onCompose={() => setMorningOpen(true)}
      />

      {agenda && morningOpen && userRole === "MANAGER" ? (
        <MorningPlanModal
          open={morningOpen}
          agenda={agenda}
          onClose={() => setMorningOpen(false)}
          onUpdated={(data) => {
            setAgenda(data);
            setMorningOpen(false);
          }}
        />
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <CalendarDays className="h-4 w-4" />
            Активність команди за день
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActivityDate((d) => shiftYmdInKyiv(d, -1))}
              className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50"
              aria-label="Previous day"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <input
              type="date"
              value={activityDate}
              onChange={(e) => setActivityDate(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-800 shadow-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
            />
            <button
              type="button"
              onClick={() => setActivityDate((d) => shiftYmdInKyiv(d, 1))}
              className="rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-600 hover:bg-zinc-50"
              aria-label="Next day"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setActivityDate(todayYmdInKyiv())}
              className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Сьогодні
            </button>
          </div>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          День за календарною датою (Київ). Дзвінки за менеджером у записі дзвінка; візити —{" "}
          <span className="font-medium text-zinc-600">Visit</span>; замовлення та оплати ({activity?.currency ?? "USD"}) — за власником
          замовлення.
          {showTeamDayPlan ? " Сортування за % плану дня (найнижчі зверху)." : ""}
        </p>
        {activityLoading ? (
          <p className="text-sm text-zinc-500">Завантаження…</p>
        ) : activityError ? (
          <p className="text-sm text-red-700">{activityError}</p>
        ) : !activity?.rows?.length ? (
          <p className="text-sm text-zinc-500">Немає рядків (немає доступних користувачів).</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3">Менеджер</th>
                  {showTeamDayPlan ? (
                    <th className="py-2 pr-2">% плану</th>
                  ) : null}
                  <th className="py-2 pr-2">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> Вхідні
                    </span>
                  </th>
                  <th className="py-2 pr-2">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" /> Вихідні
                    </span>
                  </th>
                  <th className="py-2 pr-2">Візити</th>
                  <th className="py-2 pr-2">Замовлення</th>
                  <th className="py-2 pr-2">Сума замовлень</th>
                  <th className="py-2">Оплати ({activity?.currency ?? "USD"})</th>
                </tr>
              </thead>
              <tbody>
                {activityRowsSorted.map((row) => (
                  <tr key={row.userId} className="border-b border-zinc-100 last:border-0">
                    <td className="py-2 pr-3 font-medium text-zinc-900">
                      {showTeamDayPlan ? (
                        <Link
                          href={`/work/day-plan?date=${encodeURIComponent(activityDate)}&userId=${encodeURIComponent(row.userId)}`}
                          className="hover:text-sky-700 hover:underline"
                        >
                          {row.fullName}
                        </Link>
                      ) : (
                        row.fullName
                      )}
                    </td>
                    {showTeamDayPlan ? (
                      <td className="py-2 pr-2">
                        <DayPlanPercentBadge
                          percent={row.dayPlanPercent ?? 0}
                          status={row.dayPlanStatus ?? "red"}
                        />
                      </td>
                    ) : null}
                    <td className="py-2 pr-2 tabular-nums text-zinc-800">{row.callsInbound}</td>
                    <td className="py-2 pr-2 tabular-nums text-zinc-800">{row.callsOutbound}</td>
                    <td className="py-2 pr-2 tabular-nums text-zinc-800">{row.visits}</td>
                    <td className="py-2 pr-2 tabular-nums text-zinc-800">{row.ordersCount}</td>
                    <td className="py-2 pr-2 tabular-nums text-zinc-800">{formatMoney(row.ordersAmount)}</td>
                    <td className="py-2 tabular-nums text-zinc-800">
                      {formatMoney(row.paymentsAmount)} {baseCurrencySymbol(activity?.currency ?? "USD")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <ListTodo className="h-4 w-4" />
            Upcoming tasks
          </h2>
          <Link
            href="/tasks"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            View all
          </Link>
        </div>
        {tasksLoading ? (
          <PageLoading inline />
        ) : tasks.length === 0 ? (
          <p className="text-sm text-zinc-500">No open tasks.</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 bg-zinc-50/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{task.title}</p>
                  <p className="text-xs text-zinc-500">Due: {formatTaskDue(task.dueAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void completeTask(task.id)}
                  className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  Complete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-700">Revenue by day</h2>
          <div className="h-72">
            {revenueByDayDisplay.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueByDayDisplay} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#71717a" />
                  <YAxis tick={{ fontSize: 12 }} stroke="#71717a" tickFormatter={formatMoney} />
                  <Tooltip
                    formatter={(value: number) => [formatMoney(value), "Amount"]}
                    labelFormatter={(label) => label}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e4e4e7" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalAmount"
                    name="Revenue"
                    stroke="#0ea5e9"
                    strokeWidth={2}
                    dot={{ fill: "#0ea5e9", r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-400 text-sm">
                No data for period
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-700">Orders by stage</h2>
          <div className="h-72">
            {ordersByStageDisplay.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={ordersByStageDisplay}
                  layout="vertical"
                  margin={{ top: 5, right: 30, left: 0, bottom: 5 }}
                >
                  <XAxis type="number" tick={{ fontSize: 12 }} stroke="#71717a" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 11 }}
                    stroke="#71717a"
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e4e4e7" }}
                  />
                  <Bar dataKey="count" name="Count" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-400 text-sm">
                No data for period
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-700">Leads by status</h2>
          <div className="h-72">
            {leadsByStatusDisplay.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leadsByStatusDisplay}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {leadsByStatusDisplay.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [value, "Count"]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e4e4e7" }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-400 text-sm">
                No data for period
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-zinc-700">Leads by source</h2>
          <div className="h-72">
            {leadsBySourceDisplay.some((d) => d.value > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leadsBySourceDisplay}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {leadsBySourceDisplay.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [value, "Count"]}
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e4e4e7" }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-zinc-400 text-sm">
                No data for period
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
