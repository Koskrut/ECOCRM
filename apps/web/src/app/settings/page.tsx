"use client";

import { useEffect, useState } from "react";
import { apiHttp } from "@/lib/api/client";
import { useModules } from "@/lib/modules/useModules";
import { settingsHrefModuleId } from "@/lib/modules/pathModuleGating";
import { SettingCard, SettingCardSkeleton } from "@/components/SettingCard";
import { strings } from "@/locales";

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

type CardDescriptor = {
  href: string;
  title: string;
  desc: string;
  /** When non-null, the card is shown only if the role matches. */
  adminOnly?: boolean;
  accent?: boolean;
};

function useCoreCards(role: string | null): CardDescriptor[] {
  const t = strings.settings.cards;
  const all: CardDescriptor[] = [
    { href: "/settings/access", title: t.access.title, desc: t.access.desc },
    {
      href: "/settings/orders-pipeline",
      title: t.ordersPipeline.title,
      desc: t.ordersPipeline.desc,
      adminOnly: true,
    },
    {
      href: "/settings/leads-pipeline",
      title: t.leadsPipeline.title,
      desc: t.leadsPipeline.desc,
      adminOnly: true,
    },
    { href: "/settings/exchange-rates", title: t.exchangeRates.title, desc: t.exchangeRates.desc },
    { href: "/settings/google-maps", title: t.googleMaps.title, desc: t.googleMaps.desc },
    { href: "/settings/meta-lead-ads", title: t.metaLeadAds.title, desc: t.metaLeadAds.desc },
    { href: "/employees", title: t.employees.title, desc: t.employees.desc },
    {
      href: "/settings/metadata",
      title: t.metadata.title,
      desc: t.metadata.desc,
      adminOnly: true,
      accent: true,
    },
    {
      href: "/settings/data-import",
      title: t.dataImport.title,
      desc: t.dataImport.desc,
      adminOnly: true,
    },
    { href: "/settings/health", title: t.health.title, desc: t.health.desc, adminOnly: true },
  ];
  return all.filter((c) => !c.adminOnly || role === "ADMIN");
}

function extensionCards(): CardDescriptor[] {
  const t = strings.settings.cards;
  return [
    { href: "/settings/fop", title: t.fop.title, desc: t.fop.desc },
    { href: "/settings/google-sheet", title: t.googleSheet.title, desc: t.googleSheet.desc },
    { href: "/settings/ringostat", title: t.ringostat.title, desc: t.ringostat.desc },
    { href: "/settings/outbound-voice", title: t.outboundVoice.title, desc: t.outboundVoice.desc },
    { href: "/settings/telegram", title: t.telegram.title, desc: t.telegram.desc },
    { href: "/settings/store", title: t.store.title, desc: t.store.desc },
  ];
}

export default function SettingsHomePage() {
  const [role, setRole] = useState<string | null>(null);
  const [release, setRelease] = useState<SystemReleaseResponse | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const { status: modulesStatus, effective: moduleEffective } = useModules();

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
  const coreCards = useCoreCards(role);

  // Fail-closed: while modules are loading or errored, hide gated extensions.
  const visibleExtensions =
    modulesStatus === "ready"
      ? extensionCards().filter((card) => {
          const mid = settingsHrefModuleId(card.href);
          if (!mid) return true;
          return moduleEffective(mid);
        })
      : [];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <h1 className="mb-2 text-2xl font-bold text-zinc-900">{t.pageTitle}</h1>
      <p className="mb-6 text-sm text-zinc-500">{t.pageSubtitle}</p>

      {role === "ADMIN" ? (
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-4 text-sm shadow-sm">
          <div className="font-semibold text-zinc-900">{t.release.title}</div>
          <p className="mt-1 text-zinc-500">{t.release.hint}</p>
          {releaseError ? (
            <p className="mt-2 text-red-600">{releaseError}</p>
          ) : release ? (
            <dl className="mt-3 grid gap-1 sm:grid-cols-2">
              <div>
                <dt className="text-zinc-500">{t.release.version}</dt>
                <dd className="font-mono text-zinc-900">{dash(release.version)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">{t.release.gitSha}</dt>
                <dd className="font-mono text-zinc-900">{dash(release.gitSha)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">{t.release.builtAt}</dt>
                <dd className="font-mono text-zinc-900">{dash(release.builtAt)}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">{t.release.imageTag}</dt>
                <dd className="font-mono text-zinc-900">{dash(release.imageTag)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-zinc-400">{strings.common.loading}</p>
          )}
          {release ? (
            <p className="mt-3 border-t border-zinc-100 pt-3 text-zinc-600">
              {release.update.message}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t.sectionCore}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {coreCards.map((c) => (
          <SettingCard
            key={c.href}
            href={c.href}
            title={c.title}
            description={c.desc}
            accent={c.accent}
          />
        ))}
      </div>

      <div className="mt-10 mb-4 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t.sectionExtensions}
      </div>

      {modulesStatus === "error" ? (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {strings.modules.apiErrorBanner}
        </div>
      ) : null}

      {modulesStatus === "loading" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SettingCardSkeleton />
          <SettingCardSkeleton />
          <SettingCardSkeleton />
        </div>
      ) : visibleExtensions.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visibleExtensions.map((c) => (
            <SettingCard key={c.href} href={c.href} title={c.title} description={c.desc} />
          ))}
        </div>
      ) : modulesStatus === "ready" ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-sm text-zinc-500">
          {strings.modules.unavailableNotEffective}
        </div>
      ) : null}
    </div>
  );
}
