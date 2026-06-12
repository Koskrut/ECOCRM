import { BadRequestException } from "@nestjs/common";
import type { BalanceHolderKind } from "@prisma/client";

export type BalanceHolder = {
  holderKind: BalanceHolderKind;
  holderId: string;
  contactId: string | null;
  companyId: string | null;
};

export function resolveBalanceHolder(order: {
  clientId: string | null;
  contactId: string | null;
  companyId: string | null;
}): BalanceHolder {
  const contactId = order.clientId ?? order.contactId;
  if (contactId) {
    return {
      holderKind: "CONTACT",
      holderId: contactId,
      contactId,
      companyId: order.companyId,
    };
  }
  if (order.companyId) {
    return {
      holderKind: "COMPANY",
      holderId: order.companyId,
      contactId: null,
      companyId: order.companyId,
    };
  }
  throw new BadRequestException("Order has no contact or company for client balance");
}

export function computeOrderOverpayment(order: {
  totalAmount: number;
  returnAdjustmentAmount: number;
  paidAmount: number;
}): number {
  const effectiveTotal = Math.max(
    0,
    Number(order.totalAmount ?? 0) - Number(order.returnAdjustmentAmount ?? 0),
  );
  return Math.max(0, Number(order.paidAmount ?? 0) - effectiveTotal);
}
