"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe } from "@/lib/api";

const navItems = [
  { href: "/cabinet", label: "Огляд" },
  { href: "/cabinet/profile", label: "Профіль" },
  { href: "/cabinet/orders", label: "Замовлення" },
  { href: "/cabinet/addresses", label: "Адреси доставки" },
  { href: "/cabinet/payments", label: "Оплати" },
  { href: "/cabinet/settings", label: "Налаштування" },
] as const;

function isActive(pathname: string, href: string): boolean {
  if (href === "/cabinet") return pathname === "/cabinet";
  return pathname.startsWith(href);
}

export default function CabinetLayout({
  children,
}: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    getMe()
      .then(() => setAuthorized(true))
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="h-8 w-48 animate-pulse rounded bg-zinc-200" />
        <div className="mt-6 flex gap-6">
          <div className="h-64 w-48 animate-pulse rounded-xl bg-zinc-200" />
          <div className="flex-1 animate-pulse rounded-xl bg-zinc-200" />
        </div>
      </div>
    );
  }

  if (!authorized) {
    return null;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <nav
        className="mb-8 flex flex-wrap gap-2 border-b border-[var(--border)] pb-4"
        aria-label="Кабінет"
      >
        {navItems.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              isActive(pathname, href)
                ? "bg-[var(--primary)] text-white"
                : "text-zinc-600 hover:bg-[var(--surface)] hover:text-zinc-900"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
