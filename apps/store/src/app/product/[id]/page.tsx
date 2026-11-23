import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Product } from "@/lib/api";
import {
  formatSpecValue,
  orderedSpecEntries,
  PRODUCT_SPEC_LABELS_UK,
} from "@/lib/product-spec-labels";
import {
  buildProductJsonLd,
  compatibilityReading,
  productImagePath,
  productMetaDescription,
  productMetaTitle,
} from "@/lib/product-seo";
import { systemBySku } from "@/lib/categories";
import { getRequestSiteUrl } from "@/lib/site";
import { getStoreProductCached } from "@/lib/store-server-api";
import { ProductPageClient } from "./ProductPageClient";
import { ProductViewTracker } from "@/components/ProductViewTracker";

type PageProps = { params: Promise<{ id: string }> };

function ownImageUrl(product: Product, origin: string): string | null {
  if (!product.primaryImageId) return null;
  return `${origin}${productImagePath(product.primaryImageId)}`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await getStoreProductCached(id);
  if (!data) {
    notFound();
  }
  const { product, uahPerUsd } = data;
  const priceUah = Math.round(product.basePrice * uahPerUsd);
  const title = productMetaTitle(product);
  const description = productMetaDescription(product, priceUah);
  const siteUrl = await getRequestSiteUrl();
  const imageUrl = ownImageUrl(product, siteUrl);

  return {
    title,
    description,
    alternates: {
      canonical: `/product/${id}`,
    },
    openGraph: {
      type: "website",
      url: `/product/${id}`,
      title,
      description,
      ...(imageUrl ? { images: [{ url: imageUrl }] } : {}),
    },
    robots: {
      index: true,
      follow: true,
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { id } = await params;
  const data = await getStoreProductCached(id);
  if (!data) {
    notFound();
  }
  const { product, uahPerUsd } = data;
  const priceUah = Math.round(product.basePrice * uahPerUsd);
  const priced = priceUah > 0;
  const siteUrl = await getRequestSiteUrl();
  const system = systemBySku(product.sku);
  const jsonLd = buildProductJsonLd({ id, product, priceUah, siteUrl });
  const backHref = system ? `/systems/${system.slug}` : "/systems";

  return (
    <div className="min-h-screen">
      <ProductViewTracker id={id} name={product.name} sku={product.sku} priceUah={priceUah} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <nav aria-label="Навігаційний шлях" className="mb-4 text-sm text-zinc-600">
          <Link href="/" className="hover:text-[var(--primary)]">
            Головна
          </Link>
          {system ? (
            <>
              <span aria-hidden> / </span>
              <Link href={`/systems/${system.slug}`} className="hover:text-[var(--primary)]">
                {system.name}
              </Link>
            </>
          ) : null}
          <span aria-hidden> / </span>
          <span>{product.name}</span>
        </nav>
        <Link
          href={backHref}
          className="mb-6 inline-flex min-h-[44px] items-center text-sm text-zinc-600 hover:text-[var(--primary)] transition -ml-1"
        >
          ← Назад до каталогу
        </Link>
        <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden md:flex md:min-w-0">
          <div className="flex aspect-square w-full min-w-0 items-center justify-center overflow-hidden bg-[var(--surface)] md:w-1/2">
            {product.primaryImageId ? (
              <img
                src={productImagePath(product.primaryImageId)}
                alt={product.name}
                className="h-full w-full object-contain"
              />
            ) : product.primaryImageUrl ? (
              <img
                src={product.primaryImageUrl}
                alt={product.name}
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-5xl font-light text-zinc-300 sm:text-6xl">
                {product.name.charAt(0)}
              </span>
            )}
          </div>
          <div className="min-w-0 p-4 sm:p-6 md:w-1/2 md:p-8 flex flex-col justify-center">
            <h1 className="font-heading text-xl font-semibold text-zinc-900 sm:text-2xl">
              {product.name}
            </h1>
            {system ? <p className="mt-2 text-sm text-zinc-600">{system.name}</p> : null}
            {priced ? (
              <>
                <p className="mt-3 sm:mt-4 text-2xl font-semibold text-[var(--primary)] sm:text-3xl">
                  {priceUah} грн
                </p>
                <p className="mt-1 sm:mt-2 text-sm text-zinc-500">Ціна за шт</p>
              </>
            ) : (
              <Link
                href="/contacts#lead-compatibility"
                className="mt-4 inline-flex min-h-[48px] items-center justify-center rounded-lg bg-[var(--primary)] px-4 py-3 font-medium text-white hover:bg-[var(--primary-hover)] transition sm:min-h-[44px] sm:py-2.5"
              >
                Уточнити ціну
              </Link>
            )}
            {product.characteristics && Object.keys(product.characteristics).length > 0 ? (
              <div className="mt-6 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <h2 className="font-heading text-sm font-semibold text-zinc-800">Характеристики</h2>
                <dl className="mt-3 divide-y divide-zinc-200/90 text-sm">
                  {orderedSpecEntries(product.characteristics).map(([code, val]) => {
                    const raw = formatSpecValue(val);
                    const reading =
                      code === "compatibility_raw" ? compatibilityReading(raw) : null;
                    return (
                      <div key={code} className="flex gap-3 py-2.5 first:pt-0 items-baseline">
                        <dt className="w-[42%] max-w-[13rem] shrink-0 text-left text-xs leading-snug text-zinc-500 sm:text-sm sm:max-w-[14rem]">
                          {PRODUCT_SPEC_LABELS_UK[code] ?? code}
                        </dt>
                        <dd className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-zinc-900">
                          {raw}
                          {reading ? (
                            <span className="mt-0.5 block text-xs font-normal text-zinc-600">{reading}</span>
                          ) : null}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {priced ? <ProductPageClient productId={id} inStock={product.inStock} /> : null}
              <Link
                href={backHref}
                className="inline-flex min-h-[48px] items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-3 font-medium text-zinc-700 hover:bg-[var(--surface)] transition sm:min-h-[44px] sm:py-2.5"
              >
                Продовжити покупки
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
