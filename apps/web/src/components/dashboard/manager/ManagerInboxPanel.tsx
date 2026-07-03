"use client";

import Link from "next/link";
import {
  AlarmClock,
  CheckCircle2,
  CreditCard,
  Hourglass,
  ListTodo,
  PhoneMissed,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ManagerInboxTiles } from "@/lib/api/resources/dashboard";
import { strings } from "@/locales";

type Props = {
  tiles: ManagerInboxTiles;
};

type TileKey = keyof ManagerInboxTiles;

const TILE_ORDER: { key: TileKey; href: string; icon: LucideIcon }[] = [
  { key: "leadsWithoutTouch", href: "/leads?status=IN_PROGRESS", icon: Users },
  { key: "neverContactedNewLeads", href: "/leads?status=NEW", icon: UserPlus },
  { key: "staleInProgressLeads", href: "/leads?status=IN_PROGRESS", icon: Hourglass },
  { key: "overdueFollowupContacts", href: "/contacts?workPreset=overdue", icon: AlarmClock },
  { key: "newNoFirstContactContacts", href: "/contacts?workPreset=new-no-first-contact", icon: PhoneMissed },
  { key: "overdueTasks", href: "/tasks", icon: ListTodo },
  { key: "overduePayments", href: "/orders?financialStatus=OVERDUE", icon: CreditCard },
  { key: "debtControlContacts", href: "/contacts?workPreset=debt-control", icon: Wallet },
];

export function ManagerInboxPanel({ tiles }: Props) {
  const t = strings.dashboard.manager.inbox;
  const totalOpen = TILE_ORDER.reduce((sum, { key }) => sum + tiles[key], 0);

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{t.title}</h2>
          <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
        </div>
        {totalOpen === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t.allClear}
          </span>
        ) : null}
      </div>
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TILE_ORDER.map(({ key, href, icon }) => (
          <InboxTile
            key={key}
            title={t.tiles[key]}
            count={tiles[key]}
            href={href}
            icon={icon}
            allClearLabel={t.allClear}
          />
        ))}
      </div>
    </section>
  );
}

function InboxTile({
  title,
  count,
  href,
  icon: Icon,
  allClearLabel,
}: {
  title: string;
  count: number;
  href: string;
  icon: LucideIcon;
  allClearLabel: string;
}) {
  const isClear = count === 0;
  return (
    <Link
      href={href}
      className={`group relative block overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isClear ? "border-zinc-200" : "border-red-200"
      }`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1 ${isClear ? "bg-emerald-400/70" : "bg-red-500"}`}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-2">
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
            isClear ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
          }`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
        {isClear ? (
          <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500" />
        ) : (
          <span className="text-3xl font-semibold tabular-nums leading-none text-red-600">{count}</span>
        )}
      </div>
      <div className="mt-3 text-sm font-medium text-zinc-700">{title}</div>
      <div className={`mt-0.5 text-xs ${isClear ? "text-emerald-600" : "text-red-400"}`}>
        {isClear ? allClearLabel : null}
      </div>
    </Link>
  );
}
