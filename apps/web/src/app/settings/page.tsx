"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Search, Server, Settings2 } from "lucide-react";
import { apiHttp } from "@/lib/api/client";
import { useModules } from "@/lib/modules/useModules";
import { settingsHrefModuleId } from "@/lib/modules/pathModuleGating";
import { SettingCard, SettingCardSkeleton } from "@/components/SettingCard";
import { PageShell } from "@/components/PageShell";
import { EmptyState } from "@/components/feedback/EmptyState";
import { strings } from "@/locales";
import {
  allCards,
  filterSettingsCards,
  SETTINGS_GROUP_ORDER,
  GROUP_ICON_BG,
  type CardDescriptor,
  type SettingsGroup,
} from "@/lib/settings/settings-hub-cards";

type SystemReleaseResponse = {
  version: string | null;
  gitSha: string | null;
  builtAt: string | null;
  imageTag: string | null;
  update: { mode: string; state: string; message: string };
};

function dash(v: string | null | undefined): string {
  return v != null && v !== "" ? v : "—";
}

export default function SettingsHomePage() {
  const [role, setRole] = useState<string | null>(null);
  const [release, setRelease] = useState<SystemReleaseResponse | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const { status: modulesStatus, effective: moduleEffective } = useModules();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<SettingsGroup | "all">("all");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((r) => setRole(r.data?.user?.role ?? null))
      .catch(() => setRole(null));
  }, []);

  useEffect(() => {
    if (role !== "ADMIN") return;
    let cancelled = false;
    setReleaseError(null);
    apiHttp
      .get<SystemReleaseResponse>("/system/release")
      .then((r) => {
        if (!cancelled) setRelease(r.data ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setRelease(null);
          setReleaseError(strings.settings.release.loadError);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  const t = strings.settings;

  const visibleCards = useMemo(() => {
    const cards: CardDescriptor[] = [];
    for (const card of allCards()) {
      if (card.adminOnly && role !== "ADMIN") continue;
      if (card.leadAccess && role !== "ADMIN" && role !== "LEAD") continue;
      const mid = settingsHrefModuleId(card.href);
      if (mid) {
        if (modulesStatus !== "ready") continue;
        if (!moduleEffective(mid)) continue;
      }
      cards.push(card);
    }
    return cards;
  }, [role, modulesStatus, moduleEffective]);

  const filtered = useMemo(
    () => filterSettingsCards(visibleCards, debouncedQuery, groupFilter),
    [visibleCards, debouncedQuery, groupFilter],
  );

  const cardsByGroup = useMemo(() => {
    const map = new Map<SettingsGroup, CardDescriptor[]>(
      SETTINGS_GROUP_ORDER.map((g) => [g, []]),
    );
    for (const card of filtered) {
      map.get(card.group)?.push(card);
    }
    return map;
  }, [filtered]);

  const isSearching = debouncedQuery.length > 0 || groupFilter !== "all";

  const modulesBanner =
    modulesStatus === "error" ? (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {strings.modules.apiErrorBanner}
      </div>
    ) : null;

  return (
    <PageShell
      title={t.pageTitle}
      subtitle={t.pageSubtitle}
      icon={Settings2}
      helpRouteKey="settings"
      banner={modulesBanner}
    >
      {/* Release card (ADMIN only) */}
      {role === "ADMIN" ? (
        <ReleaseCard release={release} releaseError={releaseError} />
      ) : null}

      {/* Search + group chips */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.searchPlaceholder}
            className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-10 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <ChipButton
            active={groupFilter === "all"}
            onClick={() => setGroupFilter("all")}
          >
            {t.filterAll}
          </ChipButton>
          {SETTINGS_GROUP_ORDER.map((g) => {
            const count = visibleCards.filter((c) => c.group === g).length;
            if (count === 0) return null;
            return (
              <ChipButton
                key={g}
                active={groupFilter === g}
                onClick={() => setGroupFilter(g)}
              >
                {t.groups[g].title}
              </ChipButton>
            );
          })}
        </div>
      </div>

      {/* Cards grid */}
      {filtered.length === 0 && isSearching ? (
        <EmptyState
          icon={Search}
          title={t.noResultsTitle}
          description={t.noResultsDesc}
        />
      ) : (
        SETTINGS_GROUP_ORDER.map((group) => {
          const cards = cardsByGroup.get(group) ?? [];
          const isIntegrations = group === "integrations";

          if (cards.length === 0 && !(isIntegrations && modulesStatus === "loading" && !isSearching)) {
            return null;
          }

          return (
            <section key={group} className="mb-8">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {t.groups[group].title}
              </div>
              {!isSearching ? (
                <p className="mb-4 text-sm text-zinc-500">{t.groups[group].desc}</p>
              ) : null}
              {isIntegrations && modulesStatus === "loading" && !isSearching ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <SettingCardSkeleton />
                  <SettingCardSkeleton />
                  <SettingCardSkeleton />
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {cards.map((c) => (
                    <SettingCard
                      key={c.href}
                      href={c.href}
                      title={c.title}
                      description={c.desc}
                      icon={c.icon}
                      iconClassName={GROUP_ICON_BG[c.group]}
                      accent={c.accent}
                    />
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}

      {modulesStatus === "ready" && visibleCards.filter((c) => c.group === "integrations").length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
          {strings.modules.unavailableNotEffective}
        </div>
      ) : null}
    </PageShell>
  );
}

function ChipButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-zinc-900 bg-zinc-900 text-white"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50"
      }`}
    >
      {children}
    </button>
  );
}

function ReleaseCard({
  release,
  releaseError,
}: {
  release: SystemReleaseResponse | null;
  releaseError: string | null;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const t = strings.settings.release;

  return (
    <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-sm">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
          <Server className="h-4 w-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-zinc-900">{t.title}</div>
          <p className="mt-0.5 text-xs text-zinc-500">{t.hint}</p>
        </div>
      </div>

      {releaseError ? (
        <p className="mt-3 text-red-600">{releaseError}</p>
      ) : release ? (
        <>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-zinc-700">
            <span>
              <span className="text-zinc-500">{t.version}:</span>{" "}
              <span className="font-mono font-medium">{dash(release.version)}</span>
            </span>
            <span>
              <span className="text-zinc-500">{t.builtAt}:</span>{" "}
              <span className="font-mono">{dash(release.builtAt)}</span>
            </span>
          </div>

          {(release.gitSha || release.imageTag) ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setDetailsOpen((v) => !v)}
                className="text-xs font-medium text-zinc-500 hover:text-zinc-700"
              >
                {detailsOpen ? t.hideDetails : t.showDetails}
              </button>
              {detailsOpen ? (
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-600">
                  <span>
                    <span className="text-zinc-400">{t.gitSha}:</span>{" "}
                    <span className="font-mono">{dash(release.gitSha)}</span>
                  </span>
                  <span>
                    <span className="text-zinc-400">{t.imageTag}:</span>{" "}
                    <span className="font-mono">{dash(release.imageTag)}</span>
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-3 border-t border-zinc-100 pt-3 text-zinc-600">
            {release.update.message}
            {release.update.mode === "agent_available" ? (
              <>
                {" "}
                <Link
                  href="/settings/health"
                  className="font-medium text-zinc-900 hover:text-zinc-700"
                >
                  {t.systemHealth} →
                </Link>
              </>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-3 text-zinc-400">{strings.common.loading}</p>
      )}
    </div>
  );
}
