import Link from "next/link";
import { ButtonLink } from "./Button";

export type ProductCardProduct = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  basePrice: number;
  inStock: boolean;
  primaryImageUrl?: string | null;
  primaryImageId?: string | null;
};

function priceUah(usd: number, uahPerUsd: number) {
  return Math.round(usd * uahPerUsd);
}

export function ProductCard({
  product,
  uahPerUsd,
}: {
  product: ProductCardProduct;
  uahPerUsd: number;
}) {
  const price = priceUah(product.basePrice, uahPerUsd);

  return (
    <li className="group flex flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-white shadow-sm transition hover:shadow-md">
      <Link href={`/product/${product.id}`} className="flex flex-1 flex-col">
        <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-[var(--surface)]">
          {product.primaryImageId ? (
            <img
              src={`/api/products/images/${product.primaryImageId}/source?v=3`}
              alt=""
              width={400}
              height={300}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-3xl font-light text-zinc-300">
              {product.name.charAt(0)}
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col p-3">
          <h2 className="font-heading font-medium text-zinc-900 line-clamp-2 text-sm leading-snug">
            {product.name}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500">
            {product.sku} · {product.unit}
          </p>
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <span className="text-lg font-semibold text-[var(--primary)]">
              {price} грн
            </span>
            <span className="text-xs text-zinc-500 shrink-0">
              {product.inStock ? "В наявності" : "Під замовлення"}
            </span>
          </div>
        </div>
      </Link>
      <div className="p-3 pt-0">
        <ButtonLink
          href={`/product/${product.id}`}
          variant="primary"
          className="w-full !min-h-0 !py-1.5 !px-3 text-xs font-medium"
        >
          В кошик
        </ButtonLink>
      </div>
    </li>
  );
}
