import type { LucideIcon } from "lucide-react";
import {
  Shield,
  Users,
  Bell,
  CalendarDays,
  Columns3,
  Percent,
  Filter,
  Coins,
  Map,
  Megaphone,
  MessageCircle,
  Landmark,
  CreditCard,
  Receipt,
  Sheet,
  Truck,
  Phone,
  PhoneOutgoing,
  Send,
  ShoppingBag,
  Activity,
  Database,
  Upload,
} from "lucide-react";
import { strings } from "@/locales";

export type SettingsGroup = "accessTeam" | "salesProcesses" | "integrations" | "system" | "advanced";

export type CardDescriptor = {
  href: string;
  title: string;
  desc: string;
  group: SettingsGroup;
  icon: LucideIcon;
  adminOnly?: boolean;
  leadAccess?: boolean;
  accent?: boolean;
};

export const SETTINGS_GROUP_ORDER: SettingsGroup[] = [
  "accessTeam",
  "salesProcesses",
  "integrations",
  "system",
  "advanced",
];

export const GROUP_ICON_BG: Record<SettingsGroup, string> = {
  accessTeam: "bg-blue-100 text-blue-600",
  salesProcesses: "bg-amber-100 text-amber-600",
  integrations: "bg-violet-100 text-violet-600",
  system: "bg-zinc-100 text-zinc-600",
  advanced: "bg-emerald-100 text-emerald-700",
};

export function allCards(): CardDescriptor[] {
  const t = strings.settings.cards;
  return [
    { href: "/settings/access", icon: Shield, ...t.access, group: "accessTeam" },
    { href: "/employees", icon: Users, ...t.employees, group: "accessTeam" },
    { href: "/settings/notifications", icon: Bell, ...t.notifications, group: "accessTeam" },
    { href: "/settings/day-plan", icon: CalendarDays, ...t.dayPlan, group: "salesProcesses", leadAccess: true },
    { href: "/settings/orders-pipeline", icon: Columns3, ...t.ordersPipeline, group: "salesProcesses", adminOnly: true },
    { href: "/settings/order-discounts", icon: Percent, ...t.orderDiscounts, group: "salesProcesses", adminOnly: true },
    { href: "/settings/leads-pipeline", icon: Filter, ...t.leadsPipeline, group: "salesProcesses", adminOnly: true },
    { href: "/settings/exchange-rates", icon: Coins, ...t.exchangeRates, group: "salesProcesses" },
    { href: "/settings/google-maps", icon: Map, ...t.googleMaps, group: "integrations" },
    { href: "/settings/meta-lead-ads", icon: Megaphone, ...t.metaLeadAds, group: "integrations" },
    { href: "/settings/meta-messaging", icon: MessageCircle, ...t.metaMessaging, group: "integrations" },
    { href: "/settings/bank", icon: Landmark, ...t.bank, group: "integrations" },
    { href: "/settings/privat24", icon: CreditCard, ...t.privat24, group: "integrations" },
    { href: "/settings/upc", icon: CreditCard, ...t.upc, group: "integrations" },
    { href: "/settings/integrations/1c-payments", icon: Receipt, ...t.oneCPayments, group: "integrations", leadAccess: true },
    { href: "/settings/google-sheet", icon: Sheet, ...t.googleSheet, group: "integrations" },
    { href: "/settings/nova-poshta", icon: Truck, ...t.novaPoshta, group: "integrations" },
    { href: "/settings/ringostat", icon: Phone, ...t.ringostat, group: "integrations" },
    { href: "/settings/kyivstar-fmc", icon: Phone, ...t.kyivstarFmc, group: "integrations" },
    { href: "/settings/outbound-voice", icon: PhoneOutgoing, ...t.outboundVoice, group: "integrations" },
    { href: "/settings/telegram", icon: Send, ...t.telegram, group: "integrations" },
    { href: "/settings/store", icon: ShoppingBag, ...t.store, group: "integrations" },
    { href: "/settings/health", icon: Activity, ...t.health, group: "system", adminOnly: true },
    { href: "/settings/metadata", icon: Database, ...t.metadata, group: "advanced", adminOnly: true, accent: true },
    { href: "/settings/data-import", icon: Upload, ...t.dataImport, group: "advanced", adminOnly: true },
  ];
}

export function filterSettingsCards(
  cards: CardDescriptor[],
  query: string,
  groupFilter: SettingsGroup | "all",
): CardDescriptor[] {
  const q = query.toLowerCase().trim();
  return cards.filter((c) => {
    if (groupFilter !== "all" && c.group !== groupFilter) return false;
    if (q && !c.title.toLowerCase().includes(q) && !c.desc.toLowerCase().includes(q)) return false;
    return true;
  });
}
