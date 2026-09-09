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
  financeEnabled?: boolean;
};

type TileKey = keyof ManagerInboxTiles;

const TILE_META: {
  key: TileKey;
  href: string;
  icon: LucideIcon;
  weight: number;
  finance?: boolean;
}[] = [
  {
    key: "overduePayments",
    href: "/receivables?tab=work&view=orders&overdue=true",
    icon: CreditCard,
    weight: 100,
    finance: true,
  },
  {
    key: "debtControlContacts",
    href: "/receivables?tab=work&view=clients",
    icon: Wallet,
    weight: 95,
    finance: true,
  },
  { key: "overdueTasks", href: "/tasks?attention=overdue", icon: ListTodo, weight: 90 },
  {
    key: "overdueFollowupContacts",
    href: "/contacts?workPreset=overdue",
    icon: AlarmClock,
    weight: 85,
  },
  {
    key: "staleInProgressLeads",
    href: "/leads?attention=stale-in-progress",
    icon: Hourglass,
    weight: 70,
  },
  { key: "leadsWithoutTouch", href: "/leads?attention=without-touch", icon: Users, weight: 65 },
  {
    key: "neverContactedNewLeads",
    href: "/leads?attention=never-contacted-new",
    icon: UserPlus,
    weight: 60,
  },
  {
    key: "newNoFirstContactContacts",
    href: "/contacts?workPreset=new-no-first-contact",
    icon: PhoneMissed,
    weight: 55,
  },
];

export function ManagerInboxPanel({ tiles, financeEnabled = true }: Props) {
  const t = strings.dashboard.manager.inbox;
  const meta = TILE_META.filter((tile) => financeEnabled || !tile.finance);
  const totalOpen = meta.reduce((sum, { key }) => sum + tiles[key], 0);

  // Severity band first (weight × presence), then raw count within band.
  const ranked = [...meta].sort((a, b) => {
    const scoreA = tiles[a.key] > 0 ? a.weight * 1000 + tiles[a.key] : tiles[a.key];
    const scoreB = tiles[b.key] > 0 ? b.weight * 1000 + tiles[b.key] : tiles[b.key];
    if (scoreB !== scoreA) return scoreB - scoreA;
    return b.weight - a.weight;
  });

  const hot = ranked.filter(({ key }) => tiles[key] > 0);
  const clear = ranked.filter(({ key }) => tiles[key] === 0);
  const ordered = [...hot, ...clear];

  return (
    <section className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-900">{t.title}</h2>
          <p className="mt-1 text-sm text-zinc-500">
            {t.subtitle} {t.prioritizedHint}
          </p>
        </div>
        {totalOpen === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {t.allClear}
          </span>
        ) : (
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            {totalOpen}
          </span>
        )}
      </div>
      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ordered.map(({ key, href, icon }, index) => (
          <InboxTile
            key={key}
            title={t.tiles[key]}
            count={tiles[key]}
            href={href}
            icon={icon}
            allClearLabel={t.allClear}
            rank={tiles[key] > 0 ? index + 1 : null}
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
  rank,
}: {
  title: string;
  count: number;
  href: string;
  icon: LucideIcon;
  allClearLabel: string;
  rank: number | null;
}) {
  const isClear = count === 0;
  const isTop = rank != null && rank <= 3;
  return (
    <Link
      href={href}
      className={`group relative block overflow-hidden rounded-xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        isClear ? "border-zinc-200 opacity-80" : isTop ? "border-red-300" : "border-red-200"
      }`}
    >
      <span
        className={`absolute inset-y-0 left-0 w-1 ${
          isClear ? "bg-emerald-400/70" : isTop ? "bg-red-600" : "bg-red-400"
        }`}
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
          <div className="text-right">
            {rank != null ? (
              <div className="text-[10px] font-semibold uppercase tracking-wide text-red-400">
                #{rank}
              </div>
            ) : null}
            <span className="text-3xl font-semibold tabular-nums leading-none text-red-600">
              {count}
            </span>
          </div>
        )}
      </div>
      <div className="mt-3 text-sm font-medium text-zinc-700">{title}</div>
      <div className={`mt-0.5 text-xs ${isClear ? "text-emerald-600" : "text-red-400"}`}>
        {isClear ? allClearLabel : null}
      </div>
    </Link>
  );
}
