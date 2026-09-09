"use client";

import Link from "next/link";
import { Flame, PackageOpen, PhoneCall, Workflow } from "lucide-react";
import { formatMoneyBase, formatNumber } from "@/app/analytics/analytics-ui";
import type { ManagerPotential } from "@/lib/api/resources/dashboard";
import type { BaseCurrency } from "@/lib/base-currency";
import { strings } from "@/locales";

type Props = {
  potential: ManagerPotential;
  currency: BaseCurrency;
  financeEnabled?: boolean;
};

export function ManagerPotentialPanel({ potential, currency, financeEnabled = true }: Props) {
  const t = strings.dashboard.manager.potential;

  const cards = [
    {
      key: "unshipped",
      label: t.unshipped,
      value: formatNumber(potential.unshippedClients),
      href: "/contacts?workPreset=attention",
      cta: t.nearestQueue,
      icon: PackageOpen,
      finance: false,
    },
    {
      key: "overdue",
      label: t.overdueFollowups,
      value: formatNumber(potential.overdueFollowupContacts),
      href: "/contacts?workPreset=overdue",
      cta: t.viewQueue,
      icon: PhoneCall,
      finance: false,
    },
    {
      key: "hot",
      label: t.hotLeads,
      value: formatNumber(potential.hotLeadsCount),
      href: "/leads?status=IN_PROGRESS",
      cta: t.viewLeads,
      icon: Flame,
      finance: false,
    },
    {
      key: "pipeline",
      label: t.openPipeline,
      value: formatMoneyBase(potential.openPipelineAmount, currency),
      subtitle: t.openOrders.replace("{count}", formatNumber(potential.openPipelineOrders)),
      href: "/orders",
      cta: t.viewOrders,
      icon: Workflow,
      finance: true,
    },
  ] as const;

  const visible = cards.filter((card) => financeEnabled || !card.finance);

  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div>
        <h2 className="text-lg font-semibold text-zinc-900">{t.title}</h2>
        <p className="mt-1 text-sm text-zinc-500">{t.subtitle}</p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {visible.map((card) => {
          const Icon = card.icon;
          return (
            <Link
              key={card.key}
              href={card.href}
              className="rounded-xl border border-zinc-200 bg-zinc-50/60 p-3 transition hover:border-sky-200 hover:bg-sky-50/40"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white text-sky-700 shadow-sm">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="text-xs font-medium text-sky-700">{card.cta}</span>
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">
                {card.value}
              </div>
              <div className="mt-1 text-sm text-zinc-600">{card.label}</div>
              {"subtitle" in card && card.subtitle ? (
                <div className="mt-0.5 text-xs text-zinc-400">{card.subtitle}</div>
              ) : null}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
