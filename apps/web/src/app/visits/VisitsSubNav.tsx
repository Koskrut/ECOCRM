"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { strings } from "@/locales";

const links = [
  { href: "/visits", label: strings.nav.visits, exact: true },
  { href: "/visits/history", label: strings.nav.visitsHistory },
  { href: "/visits/fuel", label: strings.nav.visitsFuel },
];

export function VisitsSubNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-4 flex flex-wrap gap-2 border-b border-zinc-200 pb-2">
      {links.map((link) => {
        const active =
          link.exact === true
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${
              active
                ? "bg-emerald-100 text-emerald-900"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
            }`}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
