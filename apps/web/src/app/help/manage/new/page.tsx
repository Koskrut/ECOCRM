"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen } from "lucide-react";
import { PageShell } from "@/components/PageShell";
import { HelpEditor } from "@/components/help/HelpEditor";
import { helpApi, type HelpArticleInput } from "@/lib/api/resources/help";
import { useHelpCapabilities } from "@/lib/help/useHelpCapabilities";
import { strings } from "@/locales";

const emptyArticle = (): HelpArticleInput => ({
  categoryKey: "biz-sales",
  audience: "BUSINESS",
  status: "DRAFT",
  locale: "uk",
  title: "",
  excerpt: "",
  bodyMd: "",
  bindings: [],
  visibleRoles: null,
});

export default function HelpManageNewPage() {
  const router = useRouter();
  const t = strings.help;
  const { loaded, canManage } = useHelpCapabilities();
  const [value, setValue] = useState<HelpArticleInput>(emptyArticle);
  const [categories, setCategories] = useState<{ key: string; title: string; audience: "PRODUCT" | "BUSINESS" }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) return;
    if (!canManage) {
      router.replace("/help");
      return;
    }
    helpApi.listCategories().then((cats: { key: string; title: string; audience: "PRODUCT" | "BUSINESS" }[]) => {
      setCategories(cats.map((c) => ({ key: c.key, title: c.title, audience: c.audience })));
      const firstBusiness = cats.find((c) => c.audience === "BUSINESS");
      if (firstBusiness) {
        setValue((prev) => ({ ...prev, categoryKey: firstBusiness.key, audience: "BUSINESS" }));
      }
    });
  }, [loaded, canManage, router]);

  const save = async (publish = false) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await helpApi.createArticle({
        ...value,
        status: publish ? "PUBLISHED" : value.status ?? "DRAFT",
      });
      router.push(`/help/manage/${saved.id}`);
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
          disabled={saving}
          onClick={() => void save(false)}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {t.saveDraft}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => void save(true)}
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
        >
          {t.publish}
        </button>
      </>
    ),
    [save, saving, t.publish, t.saveDraft],
  );

  if (!loaded || !canManage) {
    return (
      <PageShell title={t.createArticle} icon={BookOpen}>
        <p className="text-sm text-zinc-500">{strings.common.loading}</p>
      </PageShell>
    );
  }

  return (
    <PageShell
      title={t.createArticle}
      icon={BookOpen}
      helpRouteKey="help.manage"
      tabs={[
        { label: t.backToHub, href: "/help", exact: true },
        { label: t.manageTitle, href: "/help/manage", exact: true },
        { label: t.createArticle, href: "/help/manage/new", exact: true },
      ]}
    >
      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}
      <HelpEditor value={value} onChange={setValue} categories={categories} footer={footer} />
    </PageShell>
  );
}
