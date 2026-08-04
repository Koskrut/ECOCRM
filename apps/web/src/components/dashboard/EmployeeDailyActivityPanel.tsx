"use client";

import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import {
  dashboardApi,
  type EmployeeDailyActivityRow,
  type EmployeeDailyActivitySort,
} from "@/lib/api/resources/dashboard";
import { CRM_TIME_ZONE, shiftYmdInKyiv, todayYmdInKyiv } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import { EmployeeActivityCard } from "./EmployeeActivityCard";
import { EmployeeActivityTimelineDrawer } from "./EmployeeActivityTimelineDrawer";

type LeadOption = { id: string; fullName: string };

type Props = {
  userRole: string | null;
  leads: LeadOption[];
};

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "0 хв";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} год ${m} хв`;
  return `${m} хв`;
}

function formatKyivTime(iso: string | null): string {
  if (!iso) return "";
  const dt = DateTime.fromISO(iso, { setZone: true }).setZone(CRM_TIME_ZONE);
  return dt.isValid ? dt.toFormat("HH:mm") : "";
}

function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-1 py-0.5">
      <button
        type="button"
        onClick={() => onChange(shiftYmdInKyiv(value, -1))}
        className="rounded p-1 text-zinc-500 hover:bg-zinc-100"
        aria-label="Previous day"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="border-0 bg-transparent px-1 py-1 text-sm text-zinc-800 focus:outline-none focus:ring-0"
      />
      <button
        type="button"
        onClick={() => onChange(shiftYmdInKyiv(value, 1))}
        className="rounded p-1 text-zinc-500 hover:bg-zinc-100"
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

export function EmployeeDailyActivityPanel({ userRole, leads }: Props) {
  const t = strings.dashboard.employeeActivity;
  const [date, setDate] = useState(() => todayYmdInKyiv());
  const [leadId, setLeadId] = useState("");
  const [sort, setSort] = useState<EmployeeDailyActivitySort>("activeTime");
  const [rows, setRows] = useState<EmployeeDailyActivityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void dashboardApi
      .getEmployeeDailyActivity({
        date,
        leadId: leadId || undefined,
        sort,
      })
      .then((res) => {
        if (!cancelled) setRows(res.rows);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setRows([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date, leadId, sort]);

  const isEmpty =
    !loading && rows.every((r) => r.actionCount === 0 && r.presence.status === "absent");

  const selectedRow = rows.find((r) => r.userId === selectedUserId) ?? null;

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
          <Users className="h-4 w-4" />
          {t.title}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <DatePicker value={date} onChange={setDate} />
          {userRole === "ADMIN" ? (
            <select
              value={leadId}
              onChange={(e) => setLeadId(e.target.value)}
              className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700"
            >
              <option value="">{t.allTeams}</option>
              {leads.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.fullName}
                </option>
              ))}
            </select>
          ) : null}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as EmployeeDailyActivitySort)}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-700"
          >
            <option value="activeTime">{t.sortActiveTime}</option>
            <option value="payments">{t.sortPayments}</option>
            <option value="actions">{t.sortActions}</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-zinc-500">{t.hint}</p>

      {loading ? (
        <p className="text-sm text-zinc-500">{t.loading}</p>
      ) : error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : isEmpty ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
          {t.empty}
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.userId}>
              <EmployeeActivityCard
                row={row}
                formatDuration={formatDuration}
                formatKyivTime={formatKyivTime}
                onOpenTimeline={() => setSelectedUserId(row.userId)}
              />
            </li>
          ))}
        </ul>
      )}

      {selectedRow ? (
        <EmployeeActivityTimelineDrawer
          userId={selectedRow.userId}
          fullName={selectedRow.fullName}
          date={date}
          onClose={() => setSelectedUserId(null)}
        />
      ) : null}
    </section>
  );
}
