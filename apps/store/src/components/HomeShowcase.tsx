"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/api";
import { getProducts } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";
import { ButtonLink } from "@/components/Button";
import { CategoryNav } from "@/components/CategoryNav";
import { TrustBlock } from "@/components/TrustBlock";
import { HeroSlider } from "@/components/HeroSlider";
import { PopularSystems } from "@/components/PopularSystems";
import { PromoBanner } from "@/components/PromoBanner";
import { AboutBlock } from "@/components/AboutBlock";
import { LeadCtaBlock } from "@/components/cta/LeadCtaBlock";
import { useStoreConfig } from "@/context/StoreConfigContext";
import { useTelegramWebApp } from "@/context/TelegramWebAppContext";

const RECOMMENDED_COUNT = 6;
const RECOMMENDED_FETCH_PAGE_SIZE = 48;

export function HomeShowcase() {
  const { config, loading: configLoading } = useStoreConfig();
  const telegram = useTelegramWebApp();
  const banners = config.banners ?? [];
  const [popularProducts, setPopularProducts] = useState<Product[]>([]);
  const [popularUah, setPopularUah] = useState(41);

  useEffect(() => {
    if (telegram.isTelegram) return;
    getProducts({ pageSize: RECOMMENDED_FETCH_PAGE_SIZE })
      .then((r) => {
        const eligible = r.items.filter((p) => p.basePrice > 0 && p.inStock);
        const withImage = eligible.filter((p) => p.primaryImageId);
        setPopularProducts((withImage.length > 0 ? withImage : eligible).slice(0, RECOMMENDED_COUNT));
        setPopularUah(r.uahPerUsd);
      })
      .catch(() => setPopularProducts([]));
  }, [telegram.isTelegram]);

  if (telegram.isTelegram) {
    return (
      <div className="min-h-screen">
        <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
          <h1 className="font-heading text-xl font-semibold text-zinc-900">Каталог</h1>
          <p className="mt-1 text-sm text-zinc-600">Оберіть систему імплантів</p>
          <div className="mt-4">
            <PopularSystems />
          </div>
          <div className="mt-6">
            <CategoryNav />
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <h1 className="mx-auto max-w-6xl px-4 pt-8 font-heading text-2xl font-semibold text-zinc-900 sm:px-6 sm:text-3xl">
        SUPREX — стоматологічні компоненти сумісності
      </h1>
      <HeroSlider banners={banners} loading={configLoading} />
      <PopularSystems />
      <TrustBlock />
      <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        <LeadCtaBlock compact />
      </section>
      {popularProducts.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="mb-8 flex items-center justify-between">
            <h2 className="font-heading text-2xl font-semibold text-zinc-900">Рекомендуємо</h2>
            <ButtonLink href="/systems" variant="secondary" className="hidden sm:inline-flex">
              Весь каталог
            </ButtonLink>
          </div>
          <ul className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
            {popularProducts.map((p) => (
              <ProductCard key={p.id} product={p} uahPerUsd={popularUah} />
            ))}
          </ul>
          <div className="mt-8 flex justify-center sm:hidden">
            <ButtonLink href="/systems" variant="secondary">
              Весь каталог
            </ButtonLink>
          </div>
        </section>
      )}
      <PromoBanner />
      <AboutBlock />
    </div>
  );
}
