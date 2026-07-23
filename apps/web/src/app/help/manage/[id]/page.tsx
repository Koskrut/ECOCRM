"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { BookOpen, ExternalLink } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { ErrorPanel } from "@/components/feedback/ErrorPanel";
import { HelpEditor } from "@/components/help/HelpEditor";
import { helpApi, type HelpArticleInput } from "@/lib/api/resources/help";
import { useHelpCapabilities } from "@/lib/help/useHelpCapabilities";
import { strings } from "@/locales";

export default function HelpManageEditPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const t = strings.help;
  const { loaded, canManage, canEditProduct } = useHelpCapabilities();

  const [value, setValue] = useState<HelpArticleInput | null>(null);
  const [seedKey, setSeedKey] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [categories, setCategories] = useState<{ key: string; title: string; audience: "PRODUCT" | "BUSINESS" }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [article, cats] = await Promise.all([helpApi.getById(id), helpApi.listCategories()]);
      setCategories(cats.map((c: { key: string; title: string; audience: "PRODUCT" | "BUSINESS" }) => ({ key: c.key, title: c.title, audience: c.audience })));
      setSeedKey(article.seedKey);
      setSlug(article.slug);
      setValue({
        categoryKey: article.category?.key ?? "",
        slug: article.slug,
        audience: article.audience,
        status: article.status,
        locale: article.locale,
        title: article.title,
        excerpt: article.excerpt,
        bodyMd: article.bodyMd,
        sortOrder: article.sortOrder,
        visibleRoles: article.visibleRoles,
        bindings: article.bindings,
      });
    } catch {
      setValue(null);
      setError(t.articleNotFound);
    } finally {
      setLoading(false);
    }
  }, [id, t.articleNotFound]);

  useEffect(() => {
    if (!loaded) return;
    if (!canManage) {
      router.replace("/help");
      return;
    }
    void load();
  }, [loaded, canManage, load, router]);

  const save = async (publish = false) => {
    if (!value) return;
    if (value.audience === "PRODUCT" && !canEditProduct) {
      setError(t.productEditAdminOnly);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (publish) {
        await helpApi.updateArticle(id, value);
        await helpApi.publishArticle(id);
      } else {
        await helpApi.updateArticle(id, value);
      }
      await load();
    } catch {
      setError(t.saveError);
    } finally {
      setSaving(false);
    }
  };

  const resetSeed = async () => {
    if (!canEditProduct || !seedKey) return;
    setSaving(true);
    setError(null);
    try {
      await helpApi.resetSeed(id);
      await load();
    } catch {
      setError(t.saveError);
    } finally {
      setSaving(false);
    }
  };

  const footer = useMemo(
    () => (
      <>
        <button
          type="button"
          disabled={saving || !value}
          onClick={() => void save(false)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {t.save}
        </button>
        <button
          type="button"
          disabled={saving || !value}
          onClick={() => void save(true)}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {t.publish}
        </button>
        {slug ? (
          <Link
            href={`/help/${slug}`}
            className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
          >
            <ExternalLink className="h-4 w-4" />
            {t.viewPublished}
          </Link>
        ) : null}
      </>
    ),
    [save, saving, slug, t.publish, t.save, t.viewPublished, value],
  );

  if (!loaded || !canManage) {
    return (
      <PageShell title={t.edit} icon={BookOpen}>
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      </PageShell>
    );
  }

  if (loading) {
    return (
      <PageShell title={t.edit} icon={BookOpen}>
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      </PageShell>
    );
  }

  if (error || !value) {
    return (
      <PageShell title={t.edit} icon={BookOpen}>
        <ErrorPanel message={error ?? t.articleNotFound} />
      </PageShell>
    );
  }

  return (
    <PageShell
      title={value.title || t.edit}
      icon={BookOpen}
      helpRouteKey="help.manage"
      tabs={[
        { label: t.backToHub, href: "/help", exact: true },
        { label: t.manageTitle, href: "/help/manage", exact: true },
        { label: t.edit, href: `/help/manage/${id}`, exact: true },
      ]}
    >
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <HelpEditor
        value={value}
        onChange={setValue}
        categories={categories}
        showSeedReset={Boolean(seedKey && canEditProduct)}
        onResetSeed={() => void resetSeed()}
        footer={footer}
      />
    </PageShell>
  );
}
