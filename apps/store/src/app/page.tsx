"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { Product } from "@/lib/api";
import { getProducts } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/ProductCardSkeleton";
import { ButtonLink } from "@/components/Button";
import { CategoryNav } from "@/components/CategoryNav";
import { TrustBlock } from "@/components/TrustBlock";
import { HeroSlider } from "@/components/HeroSlider";
import { PopularSystems } from "@/components/PopularSystems";
import { PromoBanner } from "@/components/PromoBanner";
import { AboutBlock } from "@/components/AboutBlock";
import { LeadCtaBlock } from "@/components/cta/LeadCtaBlock";
import { useStoreConfig } from "@/context/StoreConfigContext";
import { PRODUCT_GROUPS } from "@/lib/categories";

const SKELETON_COUNT = 9;
const RECOMMENDED_COUNT = 6;
const RECOMMENDED_FETCH_PAGE_SIZE = 48;

function HomeContent() {
  const searchParams = useSearchParams();
  const search = searchParams.get("search");
  const category = searchParams.get("category");
  const { config, loading: configLoading } = useStoreConfig();
  const banners = config.banners ?? [];

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [uahPerUsd, setUahPerUsd] = useState(41);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [categoryDrawerOpen, setCategoryDrawerOpen] = useState(false);

  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [popularUah, setPopularUah] = useState(41);

  const isCatalogMode = Boolean(search || category);

  useEffect(() => {
    // Only load paginated products if we are in catalog mode
    if (!isCatalogMode) return;

    setPage(1);
    setLoading(true);
    getProducts({ search: search ?? undefined, category: category ?? undefined, page: 1 })
      .then((r) => {
        setProducts(r.items);
        setTotal(r.total);
        setUahPerUsd(r.uahPerUsd);
      })
      .catch(() => {
        setProducts([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  }, [search, category, isCatalogMode]);

  useEffect(() => {
    // Close category drawer after filters/search change.
    setCategoryDrawerOpen(false);
  }, [search, category]);

  useEffect(() => {
    // Only load popular products if we are in landing mode
    if (isCatalogMode) return;

    getProducts({ pageSize: RECOMMENDED_FETCH_PAGE_SIZE })
      .then((r) => {
        const withImage = r.items.filter((p) => p.primaryImageId);
        setPopularProducts(withImage.slice(0, RECOMMENDED_COUNT));
        setPopularUah(r.uahPerUsd);
      })
      .catch(() => setPopularProducts([]));
  }, [isCatalogMode]);

  const loadMore = () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    getProducts({ search: search ?? undefined, category: category ?? undefined, page: nextPage })
      .then((r) => {
        setProducts((prev) => [...prev, ...r.items]);
        setTotal(r.total);
        setPage(nextPage);
      })
      .finally(() => setLoadingMore(false));
  };

  return (
    <div className="min-h-screen">
      {!isCatalogMode ? (
        <>
          <HeroSlider banners={banners} loading={configLoading} />
          
          <PopularSystems />
          
          <TrustBlock />

          <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
            <LeadCtaBlock compact />
          </section>

          {popularProducts.length > 0 && (
            <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
              <div className="flex items-center justify-between mb-8">
                <h2 className="font-heading text-2xl font-semibold text-zinc-900">
                  Рекомендуємо
                </h2>
                <ButtonLink href="/?category=01" variant="secondary" className="hidden sm:inline-flex">
                  Весь каталог
                </ButtonLink>
              </div>
              <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
                {popularProducts.map((p) => (
                  <ProductCard key={p.id} product={p} uahPerUsd={popularUah} />
                ))}
              </ul>
              <div className="mt-8 flex justify-center sm:hidden">
                <ButtonLink href="/?category=01" variant="secondary">
                  Весь каталог
                </ButtonLink>
              </div>
            </section>
          )}

          <PromoBanner />
          
          <AboutBlock />
        </>
      ) : (
        <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
          {categoryDrawerOpen && (
            <div className="fixed inset-0 z-40 lg:hidden" aria-modal="true" role="dialog">
              <button
                type="button"
                aria-label="Закрити категорії"
                className="absolute inset-0 bg-black/40"
                onClick={() => setCategoryDrawerOpen(false)}
              />
              <aside className="absolute inset-y-0 left-0 w-[85vw] max-w-xs overflow-y-auto bg-white p-4 shadow-xl">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-heading text-base font-semibold text-zinc-900">Системи</h3>
                  <button
                    type="button"
                    aria-label="Закрити"
                    onClick={() => setCategoryDrawerOpen(false)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--border)] text-zinc-600 transition hover:bg-[var(--surface)]"
                  >
                    <span aria-hidden>✕</span>
                  </button>
                </div>
                <CategoryNav className="border-none p-0 shadow-none" onNavigate={() => setCategoryDrawerOpen(false)} />
              </aside>
            </div>
          )}

          <div className="flex flex-col gap-8 lg:flex-row">
            <aside className="hidden shrink-0 lg:block lg:w-56">
              <div className="lg:sticky lg:top-24">
                <CategoryNav />
              </div>
            </aside>
            <div className="min-w-0 flex-1">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="font-heading text-xl font-semibold text-zinc-900 sm:text-2xl">
                  Каталог
                </h2>
                <ButtonLink href="/" variant="secondary" className="text-sm">
                  На головну
                </ButtonLink>
              </div>

              <div className="sticky top-[72px] z-10 mb-4 lg:hidden">
                <button
                  type="button"
                  onClick={() => setCategoryDrawerOpen(true)}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-[var(--surface)]"
                >
                  <svg
                    className="h-4 w-4 text-zinc-500"
                    viewBox="0 0 20 20"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    aria-hidden
                  >
                    <path d="M3 5H17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M3 10H17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                    <path d="M3 15H17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                  Системи
                </button>
              </div>
              
              <p className="mb-6 text-sm text-zinc-600">
                {category
                  ? `Категорія: ${PRODUCT_GROUPS.find((g) => g.id === category)?.name ?? category}`
                  : `Результати пошуку: «${search}»`}
              </p>

              {loading ? (
                <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
                  {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                    <ProductCardSkeleton key={i} />
                  ))}
                </ul>
              ) : products.length > 0 ? (
                <>
                  <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
                    {products.map((p) => (
                      <ProductCard key={p.id} product={p} uahPerUsd={uahPerUsd} />
                    ))}
                  </ul>
                  {products.length < total && (
                    <div className="mt-8 flex justify-center">
                      <button
                        type="button"
                        onClick={loadMore}
                        disabled={loadingMore}
                        className="rounded-lg border border-[var(--border)] bg-white px-6 py-2.5 font-medium text-zinc-700 hover:bg-[var(--surface)] disabled:opacity-50 transition"
                      >
                        {loadingMore ? "Завантаження…" : "Завантажити ще"}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-xl border border-[var(--border)] bg-white p-12 text-center">
                  <p className="text-zinc-600">
                    За вашим запитом нічого не знайдено.
                  </p>
                  <ButtonLink href="/" variant="primary" className="mt-4">
                    Очистити фільтр
                  </ButtonLink>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen">
          <section className="bg-[var(--primary)] px-4 py-16 md:py-24" />
          <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
              {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </ul>
          </section>
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
