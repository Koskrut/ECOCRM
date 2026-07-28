"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { strings } from "@/locales";

const baseLinks = [
  { href: "/visits", labelKey: "visits" as const, exact: true },
  { href: "/visits/history", labelKey: "visitsHistory" as const },
  { href: "/visits/fuel", labelKey: "visitsFuel" as const },
];

export function VisitsSubNav() {
  const pathname = usePathname();
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  const links = [
    ...baseLinks,
    ...(role === "ADMIN" || role === "LEAD"
      ? [{ href: "/visits/team", labelKey: "visitsTeam" as const, exact: false as const }]
      : []),
  ];

  return (
    <nav className="-mx-1 mb-3 flex gap-2 overflow-x-auto border-b border-zinc-200 px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mb-4 md:flex-wrap md:overflow-visible">
      {links.map((link) => {
        const active =
          link.exact === true
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium ${
              active
                ? "bg-emerald-100 text-emerald-900"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}>
            {strings.nav[link.labelKey]}
          </Link>
        );
      })}
    </nav>
  );
}
