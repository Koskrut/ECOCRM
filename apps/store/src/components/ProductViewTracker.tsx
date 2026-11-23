"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/tracking";

type Props = {
  id: string;
  name: string;
  sku: string;
  priceUah: number;
};

/** view_item goes through trackEvent, which loads pixels only after consent. */
export function ProductViewTracker({ id, name, sku, priceUah }: Props) {
  useEffect(() => {
    trackEvent("view_item", {
      item_id: id,
      item_name: name,
      sku,
      ...(priceUah > 0 ? { price: priceUah } : {}),
      currency: "UAH",
    });
  }, [id, name, sku, priceUah]);

  return null;
}
