import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Product } from "@/lib/api";
import {
  formatSpecValue,
  orderedSpecEntries,
  PRODUCT_SPEC_LABELS_UK,
} from "@/lib/product-spec-labels";
import { getRequestSiteUrl } from "@/lib/site";
import { getStoreProductCached } from "@/lib/store-server-api";
import { ProductPageClient } from "./ProductPageClient";

type PageProps = { params: Promise<{ id: string }> };

function buildProductDescription(product: Product, priceUah: number): string {
  const stock = product.inStock ? "В наявності" : "Немає в наявності";
  return `${product.name}. Артикул ${product.sku}. Ціна ${priceUah} грн за ${product.unit}. ${stock}.`;
}

function resolveProductImageUrl(product: Product, origin: string): string | null {
  if (product.primaryImageUrl) {
    if (product.primaryImageUrl.startsWith("http")) return product.primaryImageUrl;
    try {
      return new URL(product.primaryImageUrl, origin).href;
    } catch {
      return null;
    }
  }
  if (product.primaryImageId) {
    return `${origin}/api/products/images/${product.primaryImageId}/source`;
  }
  return null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const data = await getStoreProductCached(id);
  if (!data) {
    notFound();
  }
  const { product, uahPerUsd } = data;
  const priceUah = Math.round(product.basePrice * uahPerUsd);
  const description = buildProductDescription(product, priceUah);
  const siteUrl = await getRequestSiteUrl();
  const imageUrl = resolveProductImageUrl(product, siteUrl);

  return {
    title: product.name,
    description,
    alternates: {
      canonical: `/product/${id}`,
    },
    openGraph: {
      type: "website",
      url: `/product/${id}`,
      title: product.name,
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
  const siteUrl = await getRequestSiteUrl();
  const ogImage = resolveProductImageUrl(product, siteUrl);
  const jsonLd = buildProductJsonLd({ id, product, priceUah, siteUrl, imageUrl: ogImage });

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/"
          className="mb-6 inline-flex min-h-[44px] items-center text-sm text-zinc-600 hover:text-[var(--primary)] transition -ml-1"
        >
          ← Назад до каталогу
        </Link>
        <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden md:flex md:min-w-0">
          <div className="flex aspect-square w-full min-w-0 items-center justify-center overflow-hidden bg-[var(--surface)] md:w-1/2">
            {product.primaryImageId ? (
              <img
                src={`/api/products/images/${product.primaryImageId}/source`}
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
            <p className="mt-3 sm:mt-4 text-2xl font-semibold text-[var(--primary)] sm:text-3xl">
              {priceUah} грн
            </p>
            <p className="mt-1 sm:mt-2 text-sm text-zinc-500">Ціна за одиницю</p>
            {product.characteristics && Object.keys(product.characteristics).length > 0 ? (
              <div className="mt-6 min-w-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
                <h2 className="font-heading text-sm font-semibold text-zinc-800">Характеристики</h2>
                <dl className="mt-3 divide-y divide-zinc-200/90 text-sm">
                  {orderedSpecEntries(product.characteristics).map(([code, val]) => (
                    <div
                      key={code}
                      className="flex gap-3 py-2.5 first:pt-0 items-baseline"
                    >
                      <dt className="w-[42%] max-w-[13rem] shrink-0 text-left text-xs leading-snug text-zinc-500 sm:text-sm sm:max-w-[14rem]">
                        {PRODUCT_SPEC_LABELS_UK[code] ?? code}
                      </dt>
                      <dd className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-zinc-900">
                        {formatSpecValue(val)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <ProductPageClient productId={id} />
              <Link
                href="/"
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

function buildProductJsonLd({
  id,
  product,
  priceUah,
  siteUrl,
  imageUrl,
}: {
  id: string;
  product: Product;
  priceUah: number;
  siteUrl: string;
  imageUrl: string | null;
}) {
  const pageUrl = `${siteUrl}/product/${id}`;
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        name: product.name,
        sku: product.sku,
        ...(imageUrl ? { image: [imageUrl] } : {}),
        offers: {
          "@type": "Offer",
          priceCurrency: "UAH",
          price: String(priceUah),
          availability: product.inStock
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
          url: pageUrl,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Головна",
            item: `${siteUrl}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: product.name,
            item: pageUrl,
          },
        ],
      },
    ],
  };
}
