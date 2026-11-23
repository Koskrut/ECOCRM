import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryNav } from "@/components/CategoryNav";
import { CategoryQuickStrip } from "@/components/CategoryQuickStrip";
import { ProductCard } from "@/components/ProductCard";
import { systemBySlug } from "@/lib/categories";
import { systemMetaDescription, systemPageText } from "@/lib/system-copy";
import { fetchStoreCatalog, fetchStoreFacets } from "@/lib/store-server-api";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ subcategory?: string; search?: string; page?: string }>;
};

function pageNumber(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function catalogHref(slug: string, subcategory: string, page: number): string {
  const params = new URLSearchParams();
  if (subcategory) params.set("subcategory", subcategory);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/systems/${slug}?${qs}` : `/systems/${slug}`;
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const sp = await searchParams;
  const system = systemBySlug(slug);
  if (!system) {
    return { title: "Систему не знайдено" };
  }
  const filtered = Boolean(sp.subcategory?.trim() || sp.search?.trim() || pageNumber(sp.page) > 1);
  return {
    title: `${system.name} — компоненти сумісності`,
    description: systemMetaDescription(system),
    alternates: { canonical: `/systems/${system.slug}` },
    robots: filtered ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function SystemPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const system = systemBySlug(slug);
  if (!system) notFound();

  const sp = await searchParams;
  const subcategory = sp.subcategory?.trim() ?? "";
  const search = sp.search?.trim() ?? "";
  const page = pageNumber(sp.page);
  const [facets, catalog] = await Promise.all([
    fetchStoreFacets(system.id),
    fetchStoreCatalog({
      category: system.id,
      subcategory: subcategory || undefined,
      search: search || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
  ]);
  const text = systemPageText(system);
  const totalPages = Math.max(1, Math.ceil(catalog.total / PAGE_SIZE));

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <nav aria-label="Навігаційний шлях" className="text-sm text-zinc-600">
        <Link href="/" className="hover:text-[var(--primary)]">
          Головна
        </Link>
        <span aria-hidden> / </span>
        <Link href="/systems" className="hover:text-[var(--primary)]">
          Системи
        </Link>
        <span aria-hidden> / </span>
        <span>{system.name}</span>
      </nav>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row">
        <aside className="hidden shrink-0 lg:block lg:w-56">
          <div className="lg:sticky lg:top-24">
            <CategoryNav />
          </div>
        </aside>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-3xl font-bold text-zinc-900 sm:text-4xl">{system.name}</h1>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-700">{text}</p>
          <p className="mt-4">
            <Link href="/contacts#lead-compatibility" className="text-[var(--primary)] hover:underline">
              Консультація з підбору сумісності
            </Link>
          </p>

          <div className="mt-6">
            <CategoryQuickStrip />
          </div>

          {facets.length > 0 ? (
            <nav className="mt-2" aria-label="Підкатегорії">
              <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-zinc-500">
                Підкатегорії
              </h2>
              <ul className="mt-2 flex flex-wrap gap-2">
                <li>
                  <Link
                    href={`/systems/${system.slug}`}
                    className={
                      "inline-flex rounded-full border px-3 py-1.5 text-sm " +
                      (subcategory
                        ? "border-[var(--border)] bg-white text-zinc-700 hover:border-[var(--primary)]"
                        : "border-[var(--primary)] bg-[var(--primary)] text-white")
                    }
                  >
                    Усі
                  </Link>
                </li>
                {facets.map((facet) => {
                  const active = subcategory === facet;
                  return (
                    <li key={facet}>
                      <Link
                        href={catalogHref(system.slug, facet, 1)}
                        className={
                          "inline-flex rounded-full border px-3 py-1.5 text-sm " +
                          (active
                            ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                            : "border-[var(--border)] bg-white text-zinc-700 hover:border-[var(--primary)]")
                        }
                      >
                        {facet}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          ) : null}

          <h2 className="mt-8 font-heading text-xl font-semibold text-zinc-900">
            {subcategory ? subcategory : "Товари"}
          </h2>
          {catalog.items.length > 0 ? (
            <ul className="mt-4 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
              {catalog.items.map((product) => (
                <ProductCard key={product.id} product={product} uahPerUsd={catalog.uahPerUsd} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-zinc-600">У цьому розділі поки немає позицій на вітрині.</p>
          )}

          {totalPages > 1 ? (
            <nav className="mt-8 flex items-center justify-between gap-3 text-sm" aria-label="Сторінки каталогу">
              {page > 1 ? (
                <Link
                  href={catalogHref(system.slug, subcategory, page - 1)}
                  className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 font-medium text-zinc-700 hover:bg-[var(--surface)]"
                >
                  Попередня
                </Link>
              ) : (
                <span />
              )}
              <span className="text-zinc-500">
                {page} / {totalPages}
              </span>
              {page < totalPages ? (
                <Link
                  href={catalogHref(system.slug, subcategory, page + 1)}
                  className="rounded-lg border border-[var(--border)] bg-white px-4 py-2 font-medium text-zinc-700 hover:bg-[var(--surface)]"
                >
                  Наступна
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}
