import { apiFetch } from "@/lib/api";

export type CreatePaymentRequestBody = {
  amount: number;
  purpose: string;
  expiresAt: string;
  displayText?: string;
  receiverCode?: string;
};

export type PaymentRequestItem = {
  id: string;
  orderId: string;
  status: string;
  effectiveStatus: string;
  amount: number;
  currency: string;
  purpose: string;
  expiresAt: string;
  recipientName: string;
  iban: string;
  edrpou: string | null;
  publicToken: string;
  nbuDeeplink: string;
  createdAt: string;
  paidAt?: string | null;
};

export const paymentRequestsApi = {
  create: (token: string, orderId: string, body: CreatePaymentRequestBody) =>
    apiFetch<PaymentRequestItem>(`/orders/${orderId}/payment-requests`, {
      method: "POST",
      body: JSON.stringify(body),
      token,
    }),
};
