"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  ContactCardAnalytics,
  ContactCardAnalyticsRange,
  ContactCardAnalyticsScope,
} from "./useContactCardAnalytics";

function formatMoney(v: number): string {
  return `${Math.round(v).toLocaleString("uk-UA")} грн`;
}

export function ContactAnalyticsTab({
  analytics,
  loading,
  error,
  range,
  scope,
  onRangeChange,
  onScopeChange,
  canUseCompanyScope,
}: {
  analytics: ContactCardAnalytics | null;
  loading: boolean;
  error: string | null;
  range: ContactCardAnalyticsRange;
  scope: ContactCardAnalyticsScope;
  onRangeChange: (v: ContactCardAnalyticsRange) => void;
  onScopeChange: (v: ContactCardAnalyticsScope) => void;
  canUseCompanyScope: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 bg-white p-3">
        <div className="inline-flex rounded-md border border-zinc-200 p-0.5">
          {(["30d", "90d", "365d"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => onRangeChange(v)}
              className={`rounded px-2 py-1 text-xs font-medium ${
                range === v ? "bg-accent-gradient text-white" : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-md border border-zinc-200 p-0.5">
          <button
            type="button"
            onClick={() => onScopeChange("contact")}
            className={`rounded px-2 py-1 text-xs font-medium ${
              scope === "contact" ? "bg-accent-gradient text-white" : "text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            Contact
          </button>
          <button
            type="button"
            onClick={() => onScopeChange("company")}
            disabled={!canUseCompanyScope}
            className={`rounded px-2 py-1 text-xs font-medium ${
              scope === "company" ? "bg-accent-gradient text-white" : "text-zinc-700 hover:bg-zinc-100"
            } disabled:cursor-not-allowed disabled:opacity-40`}
          >
            Company
          </button>
        </div>
      </div>

      {loading ? <div className="rounded-lg border border-zinc-200 bg-white p-4 text-sm text-zinc-500">Loading analytics...</div> : null}
      {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

      {!loading && !error && analytics ? (
        <>
          {analytics.meta.scopeNote ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {analytics.meta.scopeNote}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="text-xs text-zinc-500">Revenue</div>
              <div className="mt-1 text-xl font-semibold text-zinc-900">{formatMoney(analytics.kpi.revenue)}</div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="text-xs text-zinc-500">Orders</div>
              <div className="mt-1 text-xl font-semibold text-zinc-900">{analytics.kpi.ordersCount}</div>
            </div>
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="text-xs text-zinc-500">Avg order value</div>
              <div className="mt-1 text-xl font-semibold text-zinc-900">{formatMoney(analytics.kpi.avgOrderValue)}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="mb-2 text-sm font-semibold text-zinc-900">Revenue trend</div>
              {analytics.series.revenueByPeriod.length === 0 ? (
                <div className="text-sm text-zinc-500">No data for selected period.</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={analytics.series.revenueByPeriod}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v: number) => formatMoney(v)} />
                    <Bar dataKey="revenue" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-3">
              <div className="mb-2 text-sm font-semibold text-zinc-900">Orders trend</div>
              {analytics.series.ordersByPeriod.length === 0 ? (
                <div className="text-sm text-zinc-500">No data for selected period.</div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={analytics.series.ordersByPeriod}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="ordersCount" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-zinc-900">Frequently bought products</div>
            {analytics.topProducts.length === 0 ? (
              <div className="text-sm text-zinc-500">No products in selected scope.</div>
            ) : (
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="py-2 pr-3">Product</th>
                      <th className="py-2 pr-3">Qty</th>
                      <th className="py-2 pr-3">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.topProducts.map((p) => (
                      <tr key={`${p.productId ?? "snapshot"}:${p.productName}`} className="border-t border-zinc-100">
                        <td className="py-2 pr-3 text-zinc-900">{p.productName}</td>
                        <td className="py-2 pr-3 text-zinc-700">{p.qty}</td>
                        <td className="py-2 pr-3 text-zinc-700">{formatMoney(p.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
