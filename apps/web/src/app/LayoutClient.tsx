"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "../components/Sidebar";

type LayoutClientProps = {
  children: React.ReactNode;
};

const getPageTitle = (pathname: string): string => {
  if (pathname.startsWith("/orders")) return "Orders";
  if (pathname.startsWith("/companies")) return "Companies";
  if (pathname.startsWith("/contacts")) return "Contacts";
  return "CRM";
};

export function LayoutClient({ children }: LayoutClientProps) {
  const pathname = usePathname();
  const isAuthPage =
    pathname === "/login" ||
    pathname.startsWith("/auth") ||
    pathname === "/signin" ||
    pathname === "/signup";
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Detect mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Load collapsed state for desktop
  useEffect(() => {
    if (typeof window !== "undefined" && !isMobile) {
      const saved = localStorage.getItem("crm_sidebar_collapsed");
      if (saved !== null) {
        setCollapsed(saved === "true");
      }
    }
  }, [isMobile]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  // Close mobile sidebar on Escape key
  useEffect(() => {
    if (!mobileOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileOpen]);

  // Hotkey for mobile open (Ctrl/Cmd+B)
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

        if (isMobile) {
          event.preventDefault();
          setMobileOpen((prev) => !prev);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobile]);
  if (isAuthPage) {
    return <>{children}</>;
  }

  const sidebarWidthPx = isMobile ? 0 : collapsed ? 64 : 240;

  return (
    <>
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />

      <div
        className="min-h-screen transition-all duration-300"
        style={{ paddingLeft: `${sidebarWidthPx}px` }}
      >
        {/* Top bar for mobile */}
        {isMobile && (
          <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-zinc-200 bg-white px-4">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-2 text-zinc-600 hover:bg-zinc-100"
              aria-label="Open menu"
            >
              ☰
            </button>
            <h1 className="text-lg font-semibold text-zinc-900">{getPageTitle(pathname)}</h1>
          </header>
        )}

        {/* Main content */}
        <main className={isMobile ? "" : ""}>{children}</main>
      </div>
    </>
  );
}
