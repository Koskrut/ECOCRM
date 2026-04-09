"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ModuleGate } from "@/components/ModuleGate";
import { ModuleIds } from "@/lib/modules/module-ids";

const TABS = [
  { label: "Campaigns", href: "/outbound/campaigns" },
  { label: "Attempts", href: "/outbound/attempts" },
  { label: "Review", href: "/outbound/review" },
];

export default function OutboundLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <ModuleGate moduleId={ModuleIds.VoiceOutbound}>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-gradient">
              <span className="text-base text-white">📞</span>
            </div>
            <h1 className="text-xl font-semibold text-zinc-900">AI Calls</h1>
          </div>
          <nav className="mt-4 flex gap-1 border-b border-zinc-200">
            {TABS.map((t) => {
              const isActive = pathname === t.href || pathname.startsWith(`${t.href}/`);
              return (
                <Link
                  key={t.href}
                  href={t.href}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "-mb-px border-b-2 border-zinc-900 text-zinc-900"
                      : "text-zinc-500 hover:text-zinc-700"
                  }`}
                >
                  {t.label}
                </Link>
              );
            })}
          </nav>
        </div>
        {children}
      </div>
    </ModuleGate>
  );
}
