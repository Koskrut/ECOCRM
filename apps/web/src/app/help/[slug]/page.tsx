"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BookOpen, Pencil } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { ErrorPanel } from "@/components/feedback/ErrorPanel";
import { HelpMarkdown, extractToc } from "@/components/help/HelpMarkdown";
import { HelpArticleCard } from "@/components/help/HelpArticleCard";
import { helpApi, type HelpArticle } from "@/lib/api/resources/help";
import { useHelpCapabilities } from "@/lib/help/useHelpCapabilities";
import { strings } from "@/locales";

export default function HelpArticlePage() {
  const params = useParams();
  const slug = typeof params.slug === "string" ? params.slug : "";
  const t = strings.help;

  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [related, setRelated] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { canManage } = useHelpCapabilities();

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    helpApi
      .getBySlug(slug)
      .then(async (data: HelpArticle) => {
        setArticle(data);
        const relatedRes = await helpApi.listArticles({
          categoryKey: data.category?.key,
        });
        setRelated(
          (relatedRes.items ?? [])
            .filter((a: HelpArticle) => a.id !== data.id && a.status === "PUBLISHED")
            .slice(0, 4),
        );
      })
      .catch(() => {
        setArticle(null);
        setError(t.articleNotFound);
      })
      .finally(() => setLoading(false));
  }, [slug, t.articleNotFound]);

  const toc = useMemo(() => (article ? extractToc(article.bodyMd) : []), [article]);

  if (loading) {
    return (
      <PageShell title={t.pageTitle} icon={BookOpen}>
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      </PageShell>
    );
  }

  if (error || !article) {
    return (
      <PageShell title={t.pageTitle} icon={BookOpen}>
        <ErrorPanel message={error ?? t.articleNotFound} />
        <Link href="/help" className="mt-4 inline-flex items-center gap-2 text-sm text-blue-700 hover:underline">
          <ArrowLeft className="h-4 w-4" />
          {t.backToHub}
        </Link>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={article.title}
      subtitle={article.excerpt ?? undefined}
      icon={BookOpen}
      helpRouteKey="help"
      actions={
        canManage ? (
          <Link
            href={`/help/manage/${article.id}`}
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            <Pencil className="h-4 w-4" />
            {t.edit}
          </Link>
        ) : null
      }
    >
      <Link href="/help" className="mb-4 inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-800">
        <ArrowLeft className="h-4 w-4" />
        {t.backToHub}
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_220px]">
        <article className="min-w-0 rounded-xl border border-zinc-200 bg-white p-6">
          <HelpMarkdown content={article.bodyMd} />
        </article>

        {toc.length > 0 ? (
          <aside className="hidden lg:block">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">{t.onThisPage}</p>
            <nav className="space-y-1">
              {toc.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`block text-sm text-zinc-600 hover:text-zinc-900 ${item.level === 3 ? "pl-3" : ""}`}
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>
        ) : null}
      </div>

      {related.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900">{t.relatedTitle}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {related.map((item) => (
              <HelpArticleCard key={item.id} article={item} />
            ))}
          </div>
        </section>
      ) : null}
    </PageShell>
  );
}
