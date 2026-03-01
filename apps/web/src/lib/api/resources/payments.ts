import { apiHttp } from "../client";

export type PaymentItem = {
  id: string;
  orderId: string;
  sourceType: string;
  amount: number;
  currency: string;
  paidAt: string;
  status: string;
  note: string | null;
  bankTransaction?: {
    id: string;
    bookedAt: string;
    description: string | null;
    counterpartyName: string | null;
  } | null;
  createdBy?: { id: string; fullName: string } | null;
};

export async function listPaymentsByOrder(orderId: string): Promise<PaymentItem[]> {
  const r = await apiHttp.get<PaymentItem[]>(`/orders/${orderId}/payments`);
  return Array.isArray(r.data) ? r.data : [];
}

export async function createCashPayment(params: {
  orderId: string;
  amount: number;
  paidAt: string;
  contactId?: string;
  note?: string;
}): Promise<PaymentItem[]> {
  const r = await apiHttp.post<PaymentItem[]>(`/payments/cash`, params);
  return Array.isArray(r.data) ? r.data : [];
}

export async function allocatePayment(params: {
  transactionId: string;
  orderId: string;
  amount?: number;
}): Promise<PaymentItem[]> {
  const r = await apiHttp.post<PaymentItem[]>(`/payments/allocate`, params);
  return Array.isArray(r.data) ? r.data : [];
}
