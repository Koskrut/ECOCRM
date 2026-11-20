"use client";

import { useEffect, useState } from "react";
import { getProducts, type Product } from "@/lib/api";
import { ProductCard } from "@/components/ProductCard";
import { useStoreConfig } from "@/context/StoreConfigContext";
import { reportPromoView } from "@/lib/meta-promo";

export default function PromoBfPage() {
  const { config } = useStoreConfig();
  const [products, setProducts] = useState<Product[]>([]);
  const [uahPerUsd, setUahPerUsd] = useState(41);

  useEffect(() => {
    void reportPromoView("/promo/bf", window.location.search);
    getProducts({ page: 1, pageSize: 24 })
      .then((result) => {
        setProducts(result.items);
        setUahPerUsd(result.uahPerUsd);
      })
      .catch(() => setProducts([]));
  }, []);

  const username = config.telegramBotUsername?.trim().replace(/^@/, "") ?? "";
  const botHref = username ? `https://t.me/${username}?start=bf2026` : "";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-heading text-2xl font-semibold text-zinc-900">Каталог</h1>
        {botHref ? (
          <a
            href={botHref}
            className="inline-flex min-h-[48px] items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--primary-hover)] sm:min-h-[44px] sm:py-2.5"
          >
            Написати в бот
          </a>
        ) : null}
      </div>
      <ul className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} uahPerUsd={uahPerUsd} />
        ))}
      </ul>
    </div>
  );
}
