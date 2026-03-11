"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getProducts, addToCart } from "@/lib/api";
import { getCartSessionId } from "@/lib/cart-session";
import { Button } from "@/components/Button";

export default function ProductPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [product, setProduct] = useState<{
    name: string;
    basePrice: number;
    primaryImageId: string | null;
  } | null>(null);
  const [uahPerUsd, setUahPerUsd] = useState(41);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getProducts({})
      .then((r) => {
        const p = r.items.find((i) => i.id === id);
        if (p)
          setProduct({
            name: p.name,
            basePrice: p.basePrice,
            primaryImageId: p.primaryImageId ?? null,
          });
        setUahPerUsd(r.uahPerUsd);
      })
      .catch(() => {});
  }, [id]);

  const handleAddToCart = async () => {
    setAdding(true);
    try {
      const sessionId = getCartSessionId();
      await addToCart(id, 1, sessionId);
      router.push("/cart");
    } catch {
      setAdding(false);
    }
  };

  const priceUah = product ? Math.round(product.basePrice * uahPerUsd) : 0;

  return (
    <div className="min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Link
          href="/"
          className="mb-6 inline-flex min-h-[44px] items-center text-sm text-zinc-600 hover:text-[var(--primary)] transition -ml-1"
        >
          ← Назад до каталогу
        </Link>
        <div className="rounded-xl border border-[var(--border)] bg-white shadow-sm overflow-hidden md:flex">
          <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-[var(--surface)] md:w-1/2">
            {product?.primaryImageId ? (
              <img
                src={`/api/products/images/${product.primaryImageId}/source`}
                alt=""
                className="h-full w-full object-contain"
              />
            ) : (
              <span className="text-5xl font-light text-zinc-300 sm:text-6xl">
                {product?.name?.charAt(0) ?? "…"}
              </span>
            )}
          </div>
          <div className="p-4 sm:p-6 md:w-1/2 md:p-8 flex flex-col justify-center">
            <h1 className="font-heading text-xl font-semibold text-zinc-900 sm:text-2xl">
              {product?.name ?? "…"}
            </h1>
            <p className="mt-3 sm:mt-4 text-2xl font-semibold text-[var(--primary)] sm:text-3xl">
              {priceUah} грн
            </p>
            <p className="mt-1 sm:mt-2 text-sm text-zinc-500">Ціна за одиницю</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button
                type="button"
                disabled={adding}
                onClick={handleAddToCart}
                className="min-h-[48px] flex-1 sm:min-h-[44px]"
              >
                {adding ? "Додавання…" : "В кошик"}
              </Button>
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
