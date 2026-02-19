"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/Sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // без shell (логин/публичные)
  const noShell = pathname === "/login";
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
      setSidebarPx(ce.detail?.collapsed ? 64 : 240);
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
    <>
      {/* mobile topbar */}
      <div className="md:hidden sticky top-0 z-20 h-14 bg-white border-b flex items-center px-3">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="rounded-md px-3 py-2 text-sm border bg-white"
        >
          ☰
        </button>
        <div className="ml-3 font-semibold">CRM</div>
      </div>

      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      {/* content area: сдвиг под fixed sidebar на desktop */}
      <main className="min-h-screen bg-zinc-50" style={{ paddingLeft: sidebarPx }}>
        <div className="p-4">{children}</div>
      </main>
    </>
  );
}
