"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { formatUserRole } from "@/lib/roleLabels";
import { authApi, type MeResponse } from "@/lib/api/resources/auth";

function getInitials(me: MeResponse | null): string {
  const name = me?.user?.name?.trim() ?? "";
  const email = me?.user?.email?.trim() ?? "";
  const source = name || email || "U";
  const parts = source.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`
      : `${source[0] ?? "U"}${source[1] ?? ""}`;
  return initials.toUpperCase();
}

export function UserMenu() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    authApi
      .me()
      .then((r) => setMe(r))
      .catch(() => setMe({ user: null }));
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const initials = useMemo(() => getInitials(me), [me]);
  const displayName = me?.user?.name?.trim() || me?.user?.email || "Account";
  const role = me?.user?.role ?? null;

  const logout = async () => {
    try {
      await apiHttp.post("/auth/logout");
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="flex size-8 items-center justify-center rounded-full bg-zinc-900 text-white text-xs font-semibold">
          {initials}
        </span>
        <span className="hidden sm:block max-w-[220px] truncate">{displayName}</span>
        <span className="hidden sm:block text-zinc-400">▾</span>
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-30 mt-2 w-64 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-lg"
          role="menu"
        >
          <div className="border-b border-zinc-100 px-3 py-2">
            <div className="truncate text-sm font-semibold text-zinc-900">{displayName}</div>
            {me?.user?.email && (
              <div className="truncate text-xs text-zinc-500">{me.user.email}</div>
            )}
            {role && (
              <div className="mt-1 inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-700">
                {formatUserRole(role)}
              </div>
            )}
          </div>

          <div className="py-1">
            <Link
              href="/employees"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Employees
            </Link>
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50"
            >
              Settings
            </Link>
          </div>

          <div className="border-t border-zinc-100 p-1">
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
            >
              Вийти
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
