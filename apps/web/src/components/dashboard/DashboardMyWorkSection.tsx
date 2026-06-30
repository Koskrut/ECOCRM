"use client";

import Link from "next/link";
import { useCallback } from "react";
import { ListTodo } from "lucide-react";
import { DayPlanWidget } from "@/components/day-plan/DayPlanWidget";
import { DailyAgendaWidget } from "@/components/daily-agenda/DailyAgendaWidget";
import { MorningPlanModal } from "@/components/daily-agenda/MorningPlanModal";
import { PageLoading } from "@/components/feedback";
import type { DashboardV2Response } from "@/lib/api/resources/dashboard";
import { strings } from "@/locales";
import { DateTime } from "luxon";
import { CRM_LOCALE, CRM_TIME_ZONE } from "@/lib/crmDatetime";
import { tasksApi } from "@/lib/api/resources/tasks";

type Props = {
  myWork: DashboardV2Response["myWork"];
  userRole: string | null;
  morningOpen: boolean;
  onMorningOpenChange: (open: boolean) => void;
  onAgendaUpdated: (agenda: DashboardV2Response["myWork"]["agenda"]) => void;
  onTaskCompleted: () => void;
  tasksLoading?: boolean;
};

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

export function DashboardMyWorkSection({
  myWork,
  userRole,
  morningOpen,
  onMorningOpenChange,
  onAgendaUpdated,
  onTaskCompleted,
  tasksLoading,
}: Props) {
  const completeTask = useCallback(
    async (id: string) => {
      try {
        await tasksApi.complete(id);
        onTaskCompleted();
      } catch {
        // ignore
      }
    },
    [onTaskCompleted],
  );

  return (
    <section className="min-w-0 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">Мій день</h2>
        <p className="mt-1 text-sm text-zinc-500">План, agenda та найближчі задачі.</p>
      </div>

      <DayPlanWidget
        plan={myWork.dayPlan}
        loading={false}
        error={null}
        detailHref="/work/day-plan"
      />

      <DailyAgendaWidget
        agenda={myWork.agenda}
        loading={false}
        error={null}
        onCompose={() => onMorningOpenChange(true)}
      />

      {myWork.agenda && morningOpen && userRole === "MANAGER" ? (
        <MorningPlanModal
          open={morningOpen}
          agenda={myWork.agenda}
          onClose={() => onMorningOpenChange(false)}
          onUpdated={(data) => {
            onAgendaUpdated(data);
            onMorningOpenChange(false);
          }}
        />
      ) : null}

      <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
            <ListTodo className="h-4 w-4" />
            {strings.dashboard.upcomingTasks}
          </h3>
          <Link
            href="/tasks"
            className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
          >
            {strings.dashboard.viewAllTasks}
          </Link>
        </div>
        {tasksLoading ? (
          <PageLoading inline />
        ) : myWork.upcomingTasks.length === 0 ? (
          <p className="text-sm text-zinc-500">{strings.dashboard.noOpenTasks}</p>
        ) : (
          <ul className="space-y-2">
            {myWork.upcomingTasks.map((task) => (
              <li
                key={task.id}
                className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 bg-zinc-50/50 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{task.title}</p>
                  <p className="text-xs text-zinc-500">
                    {strings.tasks.dueLabel} {formatTaskDue(task.dueAt)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void completeTask(task.id)}
                  className="shrink-0 rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
                >
                  {strings.tasks.actions.complete}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
