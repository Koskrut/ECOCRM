"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { HelpHint } from "@/components/help/HelpHint";

export type PageShellTab = {
  label: string;
  href: string;
  /** Exact-match active highlighting (no descendant prefix). */
  exact?: boolean;
};

export type PageShellProps = {
  /** Optional page header rendered above the content. */
  title?: string;
  subtitle?: string;
  icon?: LucideIcon;
  /** Optional tabs row rendered under the title. */
  tabs?: PageShellTab[];
  /** Wrap children in a centered max-width container. Defaults to true when title or tabs are provided, false otherwise. */
  container?: boolean;
  /** Inline content rendered to the right of the title (e.g. action buttons). */
  actions?: ReactNode;
  /** Contextual help articles for this screen (shows ? popover). */
  helpRouteKey?: string;
  /** Optional banner rendered between header and children, e.g. error/info banners. */
  banner?: ReactNode;
  children: ReactNode;
};

function isTabActive(pathname: string, tab: PageShellTab): boolean {
  if (tab.exact) return pathname === tab.href;
  return pathname === tab.href || pathname.startsWith(`${tab.href}/`);
}

/**
 * Shared page chrome: title, subtitle, icon, tabs, optional banner.
 * Does not paint background or vertical padding — those belong to the app shell
 * (`apps/web/src/app/shell.tsx`). Use this for top-level pages and module layouts.
 */
export function PageShell({
  title,
  subtitle,
  icon: Icon,
  tabs,
  container,
  actions,
  helpRouteKey,
  banner,
  children,
}: PageShellProps) {
  const pathname = usePathname() ?? "";
  const hasChrome = Boolean(title || tabs);
  const useContainer = container ?? hasChrome;

  const body = (
    <>
      {hasChrome ? (
        <div className="mb-6">
          <div className="flex items-start gap-3">
            {Icon ? (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-gradient text-white">
                <Icon className="h-4 w-4" aria-hidden />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              {title ? <h1 className="text-xl font-semibold text-zinc-900">{title}</h1> : null}
              {subtitle ? <p className="mt-1 text-sm text-zinc-500">{subtitle}</p> : null}
            </div>
            {actions ? <div className="ml-3 shrink-0">{actions}</div> : null}
            {helpRouteKey ? (
              <div className="ml-2 shrink-0">
                <HelpHint routeKey={helpRouteKey} />
              </div>
            ) : null}
          </div>
          {tabs && tabs.length > 0 ? (
            <nav className="-mx-1 mt-4 flex flex-nowrap gap-1 overflow-x-auto border-b border-zinc-200">
              {tabs.map((tab) => {
                const active = isTabActive(pathname, tab);
                return (
                  <Link
                    key={tab.href}
                    href={tab.href}
                    className={`whitespace-nowrap px-4 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "-mb-px border-b-2 border-zinc-900 text-zinc-900"
                        : "text-zinc-500 hover:text-zinc-700"
                    }`}
                  >
                    {tab.label}
                  </Link>
                );
              })}
            </nav>
          ) : null}
        </div>
      ) : null}
      {banner ? <div className="mb-4">{banner}</div> : null}
      {children}
    </>
  );

  if (useContainer) {
    return <div className="mx-auto w-full max-w-7xl">{body}</div>;
  }
  return <>{body}</>;
}
