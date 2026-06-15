"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";
import { UserMenu } from "@/components/UserMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { ModulesProvider } from "@/lib/modules/useModules";
import { ConfirmProvider, ToastProvider } from "@/components/feedback";
import { KyivstarFmcShell } from "@/components/kyivstar/KyivstarIncomingCallDock";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // без shell (логин / публична оплата за посиланням)
  const path = pathname ?? "";
  const noShell = path === "/login" || path.startsWith("/pay/");
  const [mobileOpen, setMobileOpen] = useState(false);

  // ширина сайдбара: 240 (w-60) или 64 (w-16)
  const [sidebarPx, setSidebarPx] = useState<number>(240);

  // при открытии страницы — читаем localStorage
  useEffect(() => {
    const saved = localStorage.getItem("crm_sidebar_collapsed");
    setSidebarPx(saved === "true" ? 64 : 240);
  }, []);

  // слушаем событие от Sidebar при переключении collapse
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ collapsed: boolean }>;
      const collapsed = ce.detail?.collapsed ?? false;
      setSidebarPx(collapsed ? 64 : 240);
    };
    window.addEventListener("crm_sidebar", handler as EventListener);
    return () => window.removeEventListener("crm_sidebar", handler as EventListener);
  }, []);

  // на мобильном при смене роутов закрываем меню
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (noShell) return <>{children}</>;

  return (
    <ModulesProvider>
      <ConfirmProvider>
        <ToastProvider>
          <KyivstarFmcShell />
          <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

          {/* content area: отступ только на md+ через CSS, без зависимости от isMobile */}
          <div
            style={{ ["--sidebar-px" as string]: `${sidebarPx}px` }}
            className="min-h-screen max-w-full min-w-0 overflow-x-clip md:ml-[var(--sidebar-px)]"
          >
            <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-white px-[max(0.75rem,env(safe-area-inset-left))] pt-[env(safe-area-inset-top)] md:px-4 md:pt-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="md:hidden rounded-md px-3 py-2 text-sm border bg-white"
                aria-label="Відкрити меню"
              >
                ☰
              </button>
              <div className="font-semibold text-zinc-900">CRM</div>
              <div className="ml-auto flex items-center gap-2">
                <NotificationBell />
                <UserMenu />
              </div>
            </header>
            <main className="min-h-screen max-w-full min-w-0 overflow-x-clip bg-zinc-50">
              <div className="w-full max-w-full p-4">{children}</div>
            </main>
          </div>
        </ToastProvider>
      </ConfirmProvider>
    </ModulesProvider>
  );
}
