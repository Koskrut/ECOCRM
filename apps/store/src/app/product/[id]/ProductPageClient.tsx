"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addToCart } from "@/lib/api";
import { getCartSessionId } from "@/lib/cart-session";
import { Button } from "@/components/Button";

type Props = {
  productId: string;
};

export function ProductPageClient({ productId }: Props) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);

  const handleAddToCart = async () => {
    setAdding(true);
    try {
      const sessionId = getCartSessionId();
      await addToCart(productId, 1, sessionId);
      router.push("/cart");
    } catch {
      setAdding(false);
    }
  };

  return (
    <Button
      type="button"
      disabled={adding}
      onClick={handleAddToCart}
      className="min-h-[48px] flex-1 sm:min-h-[44px]"
    >
      {adding ? "Додавання…" : "В кошик"}
    </Button>
  );
}
