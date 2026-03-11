"use client";

import { useCallback, useEffect, useState } from "react";
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
} from "lucide-react";
import { tasksApi, type Task } from "@/lib/api/resources/tasks";

type DashboardStats = {
  kpi: {
    ordersCount: number;
    revenue: number;
    leadsCount: number;
    leadsConversionPercent: number;
    debtTotal: number;
  };
  ordersByStatus: { status: string; count: number }[];
  leadsByStatus: { status: string; count: number }[];
  leadsBySource: { source: string; count: number }[];
  revenueByDay: { date: string; totalAmount: number; count: number }[];
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  IN_WORK: "In progress",
  READY_TO_SHIP: "Ready to ship",
  SHIPPED: "Shipped",
  CONTROL_PAYMENT: "Payment control",
  SUCCESS: "Success",
  RETURNING: "Returning",
  CANCELED: "Canceled",
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
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
}

function formatTaskDue(dueAt: string | null | undefined): string {
  if (!dueAt) return "—";
  const d = new Date(dueAt);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const taskDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (taskDate.getTime() === today.getTime()) return "Today";
  if (taskDate.getTime() === today.getTime() + 86400000) return "Tomorrow";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function DashboardPage() {
  const [period, setPeriod] = useState<"week" | "month">("month");
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);

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

  if (loading && !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <div className="text-zinc-500">Loading…</div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800">
        Load error: {error}
      </div>
    );
  }

  const kpi = data?.kpi ?? {
    ordersCount: 0,
    revenue: 0,
    leadsCount: 0,
    leadsConversionPercent: 0,
    debtTotal: 0,
  };
  const ordersByStatus = data?.ordersByStatus ?? [];
  const leadsByStatus = data?.leadsByStatus ?? [];
  const leadsBySource = data?.leadsBySource ?? [];
  const revenueByDay = data?.revenueByDay ?? [];

  const ordersByStatusDisplay = ordersByStatus.map((r) => ({
    name: ORDER_STATUS_LABELS[r.status] ?? r.status,
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
          <p className="text-sm text-zinc-500">Loading…</p>
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
          <h2 className="mb-4 text-sm font-semibold text-zinc-700">Orders by status</h2>
          <div className="h-72">
            {ordersByStatusDisplay.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={ordersByStatusDisplay}
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
