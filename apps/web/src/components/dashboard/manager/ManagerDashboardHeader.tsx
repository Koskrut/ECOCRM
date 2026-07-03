"use client";

import Link from "next/link";
import { ClipboardList, Phone, ShoppingCart, UserPlus } from "lucide-react";
import { DateTime } from "luxon";
import { CRM_LOCALE, CRM_TIME_ZONE } from "@/lib/crmDatetime";
import { strings } from "@/locales";

type Props = {
  userName: string | null;
  onNewLead: () => void;
};

function initials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("") || "?";
}

export function ManagerDashboardHeader({ userName, onNewLead }: Props) {
  const t = strings.dashboard.manager;
  const greeting = userName
    ? t.greeting.replace("{name}", userName.trim().split(/\s+/)[0] ?? userName)
    : t.greetingFallback;
  const today = DateTime.now()
    .setZone(CRM_TIME_ZONE)
    .setLocale(CRM_LOCALE)
    .toLocaleString({ weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
          {initials(userName)}
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">{greeting}</h1>
          <p className="text-sm capitalize text-zinc-500">{today}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/work/calls"
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
        >
          <Phone className="h-4 w-4" />
          {t.quickActions.call}
        </Link>
        <button
          type="button"
          onClick={onNewLead}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50"
        >
          <UserPlus className="h-4 w-4 text-zinc-500" />
          {t.quickActions.newLead}
        </button>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50"
        >
          <ShoppingCart className="h-4 w-4 text-zinc-500" />
          {t.quickActions.newOrder}
        </Link>
        <Link
          href="/tasks"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 shadow-sm transition hover:border-zinc-400 hover:bg-zinc-50"
        >
          <ClipboardList className="h-4 w-4 text-zinc-500" />
          {t.quickActions.newTask}
        </Link>
      </div>
    </div>
  );
}
