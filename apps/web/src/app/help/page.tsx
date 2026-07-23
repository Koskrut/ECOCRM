"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Plus, Settings2 } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { EmptyState } from "@/components/feedback/EmptyState";
import { HelpArticleCard } from "@/components/help/HelpArticleCard";
import { helpApi, type HelpArticle, type HelpAudience, type HelpCategory } from "@/lib/api/resources/help";
import { useHelpCapabilities } from "@/lib/help/useHelpCapabilities";
import { strings } from "@/locales";

type AudienceTab = "ALL" | HelpAudience;

export default function HelpHubPage() {
  const t = strings.help;
  const [audienceTab, setAudienceTab] = useState<AudienceTab>("ALL");
  const [categoryKey, setCategoryKey] = useState<string>("");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [categories, setCategories] = useState<HelpCategory[]>([]);
  const [articles, setArticles] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const { canManage } = useHelpCapabilities();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, arts] = await Promise.all([
        helpApi.listCategories(),
        helpApi.listArticles({
          q: debouncedQuery || undefined,
          audience: audienceTab === "ALL" ? undefined : audienceTab,
          categoryKey: categoryKey || undefined,
          includeDrafts: canManage,
        }),
      ]);
      setCategories(cats);
      setArticles(arts.items ?? []);
    } catch {
      setCategories([]);
      setArticles([]);
    } finally {
      setLoading(false);
    }
  }, [audienceTab, categoryKey, debouncedQuery, canManage]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredCategories = useMemo(() => {
    if (audienceTab === "ALL") return categories;
    return categories.filter((c) => c.audience === audienceTab);
  }, [categories, audienceTab]);

  const tabs = [
    { key: "ALL" as const, label: t.tabAll },
    { key: "PRODUCT" as const, label: t.tabProduct },
    { key: "BUSINESS" as const, label: t.tabBusiness },
  ];

  const showPlaybooksOnly = categoryKey === "crm-manager-playbooks";

  return (
    <PageShell
      title={t.pageTitle}
      subtitle={t.pageSubtitle}
      icon={BookOpen}
      helpRouteKey="help"
      actions={
        canManage ? (
          <Link
            href="/help/manage"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Settings2 className="h-4 w-4" />
            {t.manage}
          </Link>
        ) : null
      }
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setAudienceTab(tab.key);
                if (tab.key === "BUSINESS" && categoryKey === "crm-manager-playbooks") {
                  setCategoryKey("");
                }
              }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                audienceTab === tab.key ? "bg-zinc-900 text-white" : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setCategoryKey(showPlaybooksOnly ? "" : "crm-manager-playbooks");
              if (!showPlaybooksOnly) setAudienceTab("PRODUCT");
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              showPlaybooksOnly
                ? "bg-violet-700 text-white"
                : "bg-white text-violet-700 ring-1 ring-violet-200 hover:bg-violet-50"
            }`}
          >
            {t.tabPlaybooks}
          </button>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm sm:max-w-xs"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="space-y-1">
          <button
            type="button"
            onClick={() => setCategoryKey("")}
            className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
              !categoryKey ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"
            }`}
          >
            {t.allCategories}
          </button>
          {filteredCategories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategoryKey(cat.key)}
              className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                categoryKey === cat.key ? "bg-zinc-900 text-white" : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {cat.title}
            </button>
          ))}
        </aside>

        <div>
          {loading ? (
            <p className="text-sm text-zinc-500">{strings.common.loading}</p>
          ) : articles.length === 0 ? (
            <EmptyState
              title={t.emptyTitle}
              description={t.emptyDescription}
              action={
                canManage ? (
                  <Link
                    href="/help/manage/new"
                    className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
                  >
                    <Plus className="h-4 w-4" />
                    {t.createArticle}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {articles.map((article) => (
                <HelpArticleCard key={article.id} article={article} />
              ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
