import type { Metadata } from "next";
import Link from "next/link";
import { CATALOG_SYSTEMS } from "@/lib/categories";
import { fetchStoreCatalog } from "@/lib/store-server-api";
import { ProductCard } from "@/components/ProductCard";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 24;

type PageProps = {
  searchParams: Promise<{ search?: string; page?: string }>;
};

function pageNumber(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const searching = Boolean(sp.search?.trim());
  return {
    title: searching ? "Пошук по каталогу" : "Системи",
    description:
      "Каталог систем SUPREX: титанові платформи та абатменти, доставка Новою Поштою по Україні, консультація з підбору сумісності.",
    alternates: { canonical: "/systems" },
    robots: searching ? { index: false, follow: true } : { index: true, follow: true },
  };
}

export default async function SystemsIndexPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const search = sp.search?.trim() ?? "";
  const page = pageNumber(sp.page);
  const catalog = search
    ? await fetchStoreCatalog({ search, page, pageSize: PAGE_SIZE })
    : null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-heading text-3xl font-bold text-zinc-900 sm:text-4xl">
        {search ? "Результати пошуку" : "Каталог систем SUPREX"}
      </h1>
      <p className="mt-4 max-w-3xl text-zinc-700">
        SUPREX — виробник стоматологічних компонентів сумісності: титанові платформи, абатменти та
        інші компоненти. Доставка Новою Поштою по Україні. Оплата при отриманні або карткою.
        Консультація з підбору сумісності — на сторінці контактів.
      </p>
      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {CATALOG_SYSTEMS.map((system) => (
          <li key={system.id}>
            <Link
              href={`/systems/${system.slug}`}
              className="flex min-h-[72px] items-center rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-sm font-medium text-zinc-800 hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              {system.name}
            </Link>
          </li>
        ))}
      </ul>
      {search ? (
        <section className="mt-10">
          <h2 className="font-heading text-xl font-semibold text-zinc-900">
            Знайдено: {catalog?.total ?? 0}
          </h2>
          {catalog && catalog.items.length > 0 ? (
            <ul className="mt-6 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-3">
              {catalog.items.map((product) => (
                <ProductCard key={product.id} product={product} uahPerUsd={catalog.uahPerUsd} />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-zinc-600">За запитом «{search}» нічого не знайдено.</p>
          )}
        </section>
      ) : null}
      <p className="mt-8">
        <Link href="/contacts#lead-compatibility" className="text-[var(--primary)] hover:underline">
          Консультація з підбору сумісності
        </Link>
      </p>
    </div>
  );
}
