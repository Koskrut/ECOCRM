import {
  Calendar,
  CheckSquare,
  CreditCard,
  MapPin,
  Phone,
  Sparkles,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { DailyAgendaItemKind, AgendaSuggestionCategory } from "@/lib/api/resources/daily-agenda";
import { strings } from "@/locales";

const t = strings.dailyAgenda;

export type KindConfig = {
  icon: LucideIcon;
  label: string;
  badgeClass: string;
  iconClass: string;
};

export function kindConfig(kind: DailyAgendaItemKind): KindConfig {
  switch (kind) {
    case "VISIT":
      return {
        icon: MapPin,
        label: t.kinds.visit,
        badgeClass: "bg-sky-50 text-sky-800",
        iconClass: "text-sky-600",
      };
    case "TASK":
      return {
        icon: CheckSquare,
        label: t.kinds.task,
        badgeClass: "bg-violet-50 text-violet-800",
        iconClass: "text-violet-600",
      };
    case "CONTACT_ACTION":
      return {
        icon: Phone,
        label: t.kinds.contactAction,
        badgeClass: "bg-emerald-50 text-emerald-800",
        iconClass: "text-emerald-600",
      };
    case "LEAD":
      return {
        icon: UserPlus,
        label: t.kinds.lead,
        badgeClass: "bg-amber-50 text-amber-800",
        iconClass: "text-amber-600",
      };
    case "SUGGESTION":
    default:
      return {
        icon: Sparkles,
        label: t.kinds.suggestion,
        badgeClass: "bg-zinc-100 text-zinc-700",
        iconClass: "text-zinc-500",
      };
  }
}

export function categoryConfig(category: AgendaSuggestionCategory): {
  label: string;
  icon: LucideIcon;
} {
  const icons: Record<AgendaSuggestionCategory, LucideIcon> = {
    scheduled: Calendar,
    overdue: CheckSquare,
    leads: UserPlus,
    orders: CreditCard,
    queue: Phone,
    route: MapPin,
    calls: Phone,
    debt: CreditCard,
  };
  return {
    label: t.categories[category],
    icon: icons[category],
  };
}

export const CATEGORY_ORDER: AgendaSuggestionCategory[] = [
  "scheduled",
  "overdue",
  "route",
  "leads",
  "orders",
  "queue",
  "calls",
  "debt",
];

export function scoreTone(score: number): { badge: string; bar: string } {
  if (score >= 70) return { badge: "bg-red-50 text-red-700", bar: "bg-red-500" };
  if (score >= 40) return { badge: "bg-amber-50 text-amber-700", bar: "bg-amber-400" };
  return { badge: "bg-zinc-100 text-zinc-600", bar: "bg-zinc-300" };
}
