"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Package,
  UserPlus,
  Building2,
  Users,
  LayoutGrid,
  Settings,
  Wallet,
  MapPin,
  Boxes,
  MessageCircle,
  ListTodo,
  BarChart3,
  History,
  PhoneCall,
  Archive,
  Activity,
  type LucideIcon,
} from "lucide-react";
import { apiHttp } from "../lib/api/client";
import { strings } from "@/locales";
import { useModules } from "@/lib/modules/useModules";
import { sidebarHrefModuleId } from "@/lib/modules/pathModuleGating";
import { ModuleIds } from "@/lib/modules/module-ids";
import { useInboxUnread } from "@/lib/use-inbox-unread";

type MenuItem = {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Exact-match active highlighting (no descendant prefix). */
  exact?: boolean;
};

type MeResponse = { user?: { role?: string } };

const INBOX_HREF = "/inbox/telegram";

function buildMenuItems() {
  const t = strings.nav;
  const base: MenuItem[] = [
    { label: t.dashboard, icon: LayoutDashboard, href: "/", exact: true },
    { label: t.leads, icon: UserPlus, href: "/leads" },
    { label: t.orders, icon: Package, href: "/orders" },
    { label: t.companies, icon: Building2, href: "/companies" },
    { label: t.contacts, icon: Users, href: "/contacts" },
    { label: t.tasks, icon: ListTodo, href: "/tasks" },
    { label: t.calls, icon: PhoneCall, href: "/work/calls", exact: true },
    { label: t.callsHistory, icon: Archive, href: "/work/calls/history" },
    { label: t.inbox, icon: MessageCircle, href: INBOX_HREF },
    { label: t.catalog, icon: LayoutGrid, href: "/catalog" },
    { label: t.planning, icon: BarChart3, href: "/planning" },
    { label: t.visits, icon: MapPin, href: "/visits", exact: true },
    { label: t.visitsHistory, icon: History, href: "/visits/history" },
    { label: t.aiCalls, icon: PhoneCall, href: "/outbound/campaigns" },
  ];
  const analytics: MenuItem = { label: t.analytics, icon: BarChart3, href: "/analytics" };
  const monitoring: MenuItem = { label: t.monitoring, icon: Activity, href: "/monitoring" };
  const payments: MenuItem = { label: t.payments, icon: Wallet, href: "/payments" };
  const settingsItem: MenuItem = { label: t.settings, icon: Settings, href: "/settings" };
  return { base, analytics, monitoring, payments, settingsItem };
}

const managerHiddenHrefs = new Set(["/planning", "/visits/history", "/outbound/campaigns"]);

const warehouseMenuItems = (base: MenuItem[]): MenuItem[] => {
  const t = strings.nav;
  return [
    { label: t.warehouseWork, icon: Boxes, href: "/work/warehouse", exact: true },
    { label: t.orders, icon: Package, href: "/orders" },
    { label: t.catalog, icon: LayoutGrid, href: "/catalog" },
  ];
};

function isHrefActive(pathname: string, item: MenuItem): boolean {
  if (item.exact) return pathname === item.href;
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

type SidebarProps = {
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const { status: modulesStatus, effective: moduleEffective } = useModules();

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const { base, analytics, monitoring, payments, settingsItem } = useMemo(() => buildMenuItems(), []);

  const managerMenuItems = useMemo(
    () => base.filter((item) => !managerHiddenHrefs.has(item.href)).concat(payments),
    [base, payments],
  );

  const leadMenuItems = useMemo(
    () => base.filter((item) => !managerHiddenHrefs.has(item.href)).concat(analytics, payments),
    [base, analytics, payments],
  );

  const menuItems = useMemo(() => {
    if (role === "ADMIN") return [...base, analytics, monitoring, payments, settingsItem];
    if (role === "WAREHOUSE") return warehouseMenuItems(base);
    if (role === "LEAD") return leadMenuItems;
    if (role === "MANAGER") return managerMenuItems;
    return base;
  }, [role, base, analytics, monitoring, payments, settingsItem, leadMenuItems, managerMenuItems]);

  // Fail-closed gating: hide gated entries while loading and on API error;
  // show only when the module is explicitly effective. Non-gated entries always render.
  const gatedMenuItems = useMemo(() => {
    return menuItems.filter((it) => {
      const mod = sidebarHrefModuleId(it.href);
      if (!mod) return true;
      if (modulesStatus !== "ready") return false;
      return moduleEffective(mod);
    });
  }, [menuItems, modulesStatus, moduleEffective]);

  const inboxPollEnabled = useMemo(() => {
    if (modulesStatus !== "ready") return false;
    if (!moduleEffective(ModuleIds.IntegrationsTelegram)) return false;
    if (role === "WAREHOUSE") return false;
    return gatedMenuItems.some((it) => it.href === INBOX_HREF);
  }, [gatedMenuItems, modulesStatus, moduleEffective, role]);

  const inboxHasUnread = useInboxUnread(inboxPollEnabled, pathname);

  useEffect(() => {
    apiHttp
      .get<MeResponse>("/auth/me")
      .then((res) => setRole(res.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && !isMobile) {
      const saved = localStorage.getItem("crm_sidebar_collapsed");
      if (saved !== null) {
        setCollapsed(saved === "true");
      }
    }
  }, [isMobile]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "b") {
        const target = event.target as HTMLElement;
        if (
          target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable
        ) {
          return;
        }

        event.preventDefault();

        if (isMobile) {
          if (mobileOpen) {
            onMobileClose();
          } else {
            onMobileClose();
          }
        } else {
          setCollapsed((prev) => {
            const newValue = !prev;
            localStorage.setItem("crm_sidebar_collapsed", String(newValue));
            window.dispatchEvent(
              new CustomEvent("crm_sidebar", { detail: { collapsed: newValue } }),
            );
            return newValue;
          });
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, mobileOpen, onMobileClose]);

  const sidebarWidth = collapsed ? "w-16" : "w-60";
  const sidebarWidthPx = collapsed ? 64 : 240;

  const renderNav = (onNavigate?: () => void) =>
    gatedMenuItems.map((item) => {
      const isActive = isHrefActive(pathname, item);
      const Icon = item.icon;
      const showInboxDot = item.href === INBOX_HREF && inboxHasUnread;
      return (
        <Link
          key={item.href}
          href={item.href}
          onClick={onNavigate}
          className={`mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            isActive ? "bg-accent-gradient text-white" : "text-zinc-700 hover:bg-zinc-100"
          }`}
          title={collapsed && !onNavigate ? item.label : undefined}
        >
          <span className="relative shrink-0">
            <Icon className="size-5" aria-hidden />
            {showInboxDot && collapsed && !onNavigate && (
              <span
                className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-red-600 ring-2 ring-zinc-50"
                aria-hidden
              />
            )}
          </span>
          {(!collapsed || onNavigate) && (
            <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
              <span className="truncate">{item.label}</span>
              {showInboxDot && (
                <span
                  className={`size-2 shrink-0 rounded-full bg-red-600 ${isActive ? "ring-2 ring-white/30" : ""}`}
                  aria-label="Є необроблені повідомлення"
                />
              )}
            </span>
          )}
        </Link>
      );
    });

  if (isMobile) {
    return (
      <>
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onMobileClose}
            role="presentation"
          />
        )}
        <aside
          className={`fixed left-0 top-0 z-50 flex h-full w-60 flex-col transform bg-zinc-50 shadow-lg transition-transform duration-300 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 px-4">
            <h1 className="text-lg font-semibold text-zinc-900">CRM</h1>
            <button
              type="button"
              onClick={onMobileClose}
              className="rounded-lg p-1 text-zinc-600 hover:bg-zinc-100"
              aria-label={strings.common.close}
            >
              ✕
            </button>
          </div>
          <nav className="min-h-0 flex-1 overflow-y-auto p-3">
            {modulesStatus === "loading" ? <SidebarLoadingSkeleton /> : renderNav(onMobileClose)}
          </nav>
        </aside>
      </>
    );
  }

  return (
    <aside
      className={`fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-zinc-200 bg-zinc-50 transition-all duration-300 ${sidebarWidth}`}
      style={{ width: `${sidebarWidthPx}px` }}
    >
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200 px-4">
        {!collapsed && <h1 className="text-lg font-semibold text-zinc-900">CRM</h1>}
        <button
          type="button"
          onClick={() => {
            setCollapsed((prev) => {
              const newValue = !prev;
              localStorage.setItem("crm_sidebar_collapsed", String(newValue));
              window.dispatchEvent(
                new CustomEvent("crm_sidebar", { detail: { collapsed: newValue } }),
              );
              return newValue;
            });
          }}
          className="rounded-lg p-1 text-zinc-600 hover:bg-zinc-100"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand (Ctrl+B)" : "Collapse (Ctrl+B)"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto p-3">
        {modulesStatus === "loading" ? (
          <SidebarLoadingSkeleton collapsed={collapsed} />
        ) : (
          renderNav()
        )}
      </nav>
    </aside>
  );
}

function SidebarLoadingSkeleton({ collapsed = false }: { collapsed?: boolean }) {
  const rows = Array.from({ length: 8 });
  return (
    <div aria-hidden className="space-y-1.5">
      {rows.map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-3 rounded-lg px-3 py-2 ${collapsed ? "justify-center" : ""}`}
        >
          <div className="size-5 shrink-0 animate-pulse rounded bg-zinc-200" />
          {!collapsed && <div className="h-3 w-32 animate-pulse rounded bg-zinc-200" />}
        </div>
      ))}
    </div>
  );
}
