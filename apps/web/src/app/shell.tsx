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

  // мобильный вид: сайдбар оверлей, контент без левого отступа
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

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

      {/* content area: отступ только на md+ через CSS, без зависимости от isMobile */}
      <div
        style={{ ["--sidebar-px" as string]: `${sidebarPx}px` }}
        className="min-h-screen md:ml-[var(--sidebar-px)]"
      >
        <main className="min-h-screen bg-zinc-50">
          <div className="p-4">{children}</div>
        </main>
      </div>
    </>
  );
}
