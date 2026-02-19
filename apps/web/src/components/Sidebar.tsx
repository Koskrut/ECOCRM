"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type MenuItem = {
  label: string;
  icon: string;
  href: string;
};

const baseMenuItems: MenuItem[] = [
  { label: "Orders", icon: "OR", href: "/orders" },
  { label: "Companies", icon: "CO", href: "/companies" },
  { label: "Contacts", icon: "CT", href: "/contacts" },
];

const employeesItem: MenuItem = { label: "Employees", icon: "EM", href: "/employees" };
const settingsItem: MenuItem = { label: "Settings", icon: "SE", href: "/settings" };

type SidebarProps = {
  mobileOpen: boolean;
  onMobileClose: () => void;
};

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [role, setRole] = useState<string | null>(null);

  const menuItems =
    role === "ADMIN" ? [...baseMenuItems, employeesItem, settingsItem] : baseMenuItems;

  // Detect mobile on mount
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setRole(d?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  // Load collapsed state from localStorage (desktop only)
  useEffect(() => {
    if (typeof window !== "undefined" && !isMobile) {
      const saved = localStorage.getItem("crm_sidebar_collapsed");
      if (saved !== null) {
        setCollapsed(saved === "true");
      }
    }
  }, [isMobile]);

  // Hotkey Ctrl/Cmd + B
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if Ctrl+B (Windows/Linux) or Cmd+B (macOS)
      if ((event.ctrlKey || event.metaKey) && event.key === "b") {
        // Don't trigger if focused on input/textarea/contentEditable
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
          // Mobile: toggle open/close
          if (mobileOpen) {
            onMobileClose();
          } else {
            // Signal to parent to open (we need to call parent's open handler)
            // For now we just close, parent handles opening
            onMobileClose();
          }
        } else {
          // Desktop: toggle collapsed
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

  // Mobile overlay
  if (isMobile) {
    return (
      <>
        {/* Overlay */}
        {mobileOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onMobileClose}
            role="presentation"
          />
        )}

        {/* Mobile sidebar */}
        <aside
          className={`fixed left-0 top-0 z-50 h-full w-60 transform bg-white shadow-lg transition-transform duration-300 ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-4">
            <h1 className="text-lg font-semibold text-zinc-900">CRM</h1>
            <button
              type="button"
              onClick={onMobileClose}
              className="rounded-md p-1 text-zinc-600 hover:bg-zinc-100"
              aria-label="Close menu"
            >
              ✕
            </button>
          </div>
          <nav className="p-3">
            {menuItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onMobileClose}
                  className={`mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  <span className="text-xs font-bold">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>
      </>
    );
  }

  // Desktop sidebar
  return (
    <aside
      className={`fixed left-0 top-0 z-30 h-screen border-r border-zinc-200 bg-white transition-all duration-300 ${sidebarWidth}`}
      style={{ width: `${sidebarWidthPx}px` }}
    >
      <div className="flex h-16 items-center justify-between border-b border-zinc-200 px-4">
        {!collapsed && <h1 className="text-lg font-semibold text-zinc-900">CRM</h1>}
        <button
          type="button"
          onClick={() => {
            setCollapsed((prev) => {
              const newValue = !prev;
              localStorage.setItem("crm_sidebar_collapsed", String(newValue));
              return newValue;
            });
          }}
          className="rounded-md p-1 text-zinc-600 hover:bg-zinc-100"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand (Ctrl+B)" : "Collapse (Ctrl+B)"}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </div>
      <nav className="p-3">
        {menuItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"
              }`}
              title={collapsed ? item.label : undefined}
            >
              <span className="text-xs font-bold">{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
