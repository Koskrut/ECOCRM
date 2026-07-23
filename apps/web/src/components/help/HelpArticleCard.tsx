import Link from "next/link";
import type { HelpArticle, HelpAudience } from "@/lib/api/resources/help";
import { strings } from "@/locales";

type HelpArticleCardProps = {
  article: Pick<HelpArticle, "slug" | "title" | "excerpt" | "audience" | "status"> & {
    category?: { title: string; key?: string } | null;
  };
};

const audienceLabel: Record<HelpAudience, string> = {
  PRODUCT: "CRM",
  BUSINESS: "Бізнес",
};

export function HelpArticleCard({ article }: HelpArticleCardProps) {
  const isPlaybook = article.category?.key === "crm-manager-playbooks";

  return (
    <Link
      href={`/help/${article.slug}`}
      className="block rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 hover:bg-zinc-50"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            article.audience === "PRODUCT" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800"
          }`}
        >
          {audienceLabel[article.audience]}
        </span>
        {isPlaybook ? (
          <span className="rounded bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">
            {strings.help.badgePlaybook}
          </span>
        ) : null}
        {article.status === "DRAFT" ? (
          <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">Чернетка</span>
        ) : null}
        {article.category?.title ? (
          <span className="text-xs text-zinc-500">{article.category.title}</span>
        ) : null}
      </div>
      <h3 className="text-base font-semibold text-zinc-900">{article.title}</h3>
      {article.excerpt ? <p className="mt-1 line-clamp-2 text-sm text-zinc-600">{article.excerpt}</p> : null}
    </Link>
  );
}
