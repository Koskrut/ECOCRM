import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";

import { OrderFormWizard } from "@/components/order/OrderFormWizard";

export default function EditOrderScreen() {
  const router = useRouter();
  const raw = useLocalSearchParams<{ id?: string | string[] }>().id;
  const orderId = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;

  if (!orderId) {
    return null;
  }

  return (
    <OrderFormWizard
      mode="edit"
      orderId={orderId}
      onDone={(id) => router.replace(`/orders/${id}`)}
    />
  );
}
