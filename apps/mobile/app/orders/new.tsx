import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";

import { OrderFormWizard } from "@/components/order/OrderFormWizard";

export default function NewOrderScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    contactId?: string;
    productId?: string;
    companyId?: string;
  }>();

  const contactId = typeof params.contactId === "string" ? params.contactId : null;
  const productId = typeof params.productId === "string" ? params.productId : null;
  const companyId = typeof params.companyId === "string" ? params.companyId : null;

  return (
    <OrderFormWizard
      mode="create"
      initialContactId={contactId}
      initialProductId={productId}
      initialCompanyId={companyId}
      onDone={(orderId) => router.replace(`/orders/${orderId}`)}
    />
  );
}
