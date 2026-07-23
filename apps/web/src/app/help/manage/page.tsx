"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Plus, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { EmptyState } from "@/components/feedback/EmptyState";
import { helpApi, type HelpArticle, type HelpAudience } from "@/lib/api/resources/help";
import { useHelpCapabilities } from "@/lib/help/useHelpCapabilities";
import { strings } from "@/locales";

export default function HelpManagePage() {
  const router = useRouter();
  const t = strings.help;
  const { loaded, canManage, canEditProduct } = useHelpCapabilities();
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [audience, setAudience] = useState<HelpAudience | "ALL">("ALL");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await helpApi.listArticles({
        audience: audience === "ALL" ? undefined : audience,
        includeDrafts: true,
      });
      setArticles(res.items ?? []);
    } catch {
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [audience]);

  const handleSyncSeed = useCallback(async () => {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const result = await helpApi.syncSeed();
      setSyncMessage(
        `${t.syncSeedDone}: +${result.created}, ~${result.updated}, skip ${result.skipped}`,
      );
      await load();
    } catch {
      setSyncMessage(t.saveError);
    } finally {
      setSyncing(false);
    }
  }, [load, t.saveError, t.syncSeedDone]);

  useEffect(() => {
    if (!loaded) return;
    if (!canManage) {
      router.replace("/help");
      return;
    }
    void load();
  }, [loaded, canManage, load, router]);

  const tabs = useMemo(
    () => [
      { key: "ALL" as const, label: t.tabAll },
      { key: "PRODUCT" as const, label: t.tabProduct },
      { key: "BUSINESS" as const, label: t.tabBusiness },
    ],
    [t.tabAll, t.tabBusiness, t.tabProduct],
  );

  if (!loaded || !canManage) {
    return (
      <PageShell title={t.manageTitle} icon={BookOpen}>
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={t.manageTitle}
      subtitle={t.manageSubtitle}
      icon={BookOpen}
      helpRouteKey="help.manage"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {canEditProduct ? (
            <button
              type="button"
              onClick={() => void handleSyncSeed()}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {t.syncSeed}
            </button>
          ) : null}
          <Link
            href="/help/manage/new"
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            <Plus className="h-4 w-4" />
            {t.createArticle}
          </Link>
        </div>
      }
      tabs={[
        { label: t.backToHub, href: "/help", exact: true },
        { label: t.manageTitle, href: "/help/manage", exact: true },
      ]}
    >
      {syncMessage ? <p className="mb-4 text-sm text-zinc-600">{syncMessage}</p> : null}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setAudience(tab.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              audience === tab.key ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      ) : articles.length === 0 ? (
        <EmptyState title={t.emptyTitle} description={t.emptyDescription} />
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-left text-zinc-600">
              <tr>
                <th className="px-4 py-3 font-medium">{t.fieldTitle}</th>
                <th className="px-4 py-3 font-medium">{t.fieldAudience}</th>
                <th className="px-4 py-3 font-medium">{t.fieldStatus}</th>
                <th className="px-4 py-3 font-medium">{t.fieldCategory}</th>
              </tr>
            </thead>
            <tbody>
              {articles.map((article) => (
                <tr key={article.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3">
                    <Link href={`/help/manage/${article.id}`} className="font-medium text-zinc-900 hover:text-blue-700">
                      {article.title}
                    </Link>
                    <div className="text-xs text-zinc-500">/{article.slug}</div>
                  </td>
                  <td className="px-4 py-3">{article.audience === "PRODUCT" ? "CRM" : "Бізнес"}</td>
                  <td className="px-4 py-3">{article.status === "PUBLISHED" ? t.statusPublished : t.statusDraft}</td>
                  <td className="px-4 py-3">{article.category?.title ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PageShell>
  );
}
