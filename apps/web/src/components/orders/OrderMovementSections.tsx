"use client";

import type { ReactNode } from "react";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { formatDate } from "@/lib/crmDatetime";
import { strings } from "@/locales";
import { returnStatusLabel } from "@/lib/returns/return-labels";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  ContactOrderMovementChild,
  ContactOrderPaymentSummary,
  ContactOrderReturnSummary,
} from "@/app/contacts/card/contact-orders-movement.types";

const t = strings.contacts.card.orders;

export function paymentStatusLabel(status?: string | null): string {
  const map: Record<string, string> = {
    UNPAID: t.paymentUnpaid,
    PARTIALLY_PAID: t.paymentPartial,
    PAID: t.paymentPaid,
    OVERPAID: t.paymentOverpaid,
  };
  return status ? (map[status] ?? status) : "";
}

export function PaymentStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const cfg: Record<string, string> = {
    UNPAID: "bg-zinc-100 text-zinc-700",
    PARTIALLY_PAID: "bg-amber-100 text-amber-800",
    PAID: "bg-emerald-100 text-emerald-800",
    OVERPAID: "bg-sky-100 text-sky-800",
  };
  const cls = cfg[status] ?? "bg-zinc-100 text-zinc-700";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {paymentStatusLabel(status)}
    </span>
  );
}

function paymentSourceLabel(sourceType: string): string {
  const map: Record<string, string> = {
    BANK: t.sourceBank,
    CASH: t.sourceCash,
    CREDIT: t.sourceCredit,
    CREDIT_TRANSFER: t.sourceCreditTransfer,
    ONE_C: t.sourceOneC,
  };
  return map[sourceType] ?? sourceType;
}

function formatSignedAmount(amount: number, currency: string): string {
  const formatted = formatOrderAmount(Math.abs(amount), currency);
  if (amount < 0) return `−${formatted}`;
  return `+${formatted}`;
}

export type OrderMovementSectionsProps = {
  parentOrderNumber?: string | null;
  payments: ContactOrderPaymentSummary[];
  returns: ContactOrderReturnSummary[];
  children: ContactOrderMovementChild[];
  parentHasPayments?: boolean;
  onOpenOrder: (orderId: string) => void;
  onOpenReturn?: (returnId: string) => void;
};

export function OrderMovementSections({
  parentOrderNumber,
  payments,
  returns,
  children,
  parentHasPayments = false,
  onOpenOrder,
  onOpenReturn,
}: OrderMovementSectionsProps) {
  return (
    <div className="space-y-3">
      <MovementSection title={t.payments}>
        {payments.length === 0 ? (
          <p className="text-xs text-zinc-400">{t.noPayments}</p>
        ) : (
          <ul className="space-y-1.5">
            {payments.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 text-xs">
                <div className="min-w-0 text-zinc-600">
                  <span className="font-medium text-zinc-800">{paymentSourceLabel(p.sourceType)}</span>
                  <span className="text-zinc-400"> · {formatDate(p.paidAt)}</span>
                </div>
                <span className="shrink-0 tabular-nums text-zinc-800">
                  {formatSignedAmount(p.amount, p.currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </MovementSection>

      <MovementSection title={t.returns}>
        {returns.length === 0 ? (
          <p className="text-xs text-zinc-400">{t.noReturns}</p>
        ) : (
          <ul className="space-y-1.5">
            {returns.map((ret) => {
              const content = (
                <>
                  <div className="min-w-0">
                    <div className="font-medium text-zinc-800">{returnStatusLabel(ret.status)}</div>
                    <div className="text-zinc-400">{formatDate(ret.requestedAt)}</div>
                    {ret.replacementOrderNumber ? (
                      <div className="text-zinc-500">
                        {t.replacementOrder.replace("{number}", ret.replacementOrderNumber)}
                      </div>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right text-zinc-600">
                    {Number(ret.creditAmount ?? 0) > 0 ? (
                      <div>
                        {t.creditAmount} {Number(ret.creditAmount).toFixed(2)}
                      </div>
                    ) : null}
                    {Number(ret.refundAmount ?? 0) > 0 ? (
                      <div>
                        {t.refundAmount} {Number(ret.refundAmount).toFixed(2)}
                      </div>
                    ) : null}
                  </div>
                </>
              );
              return (
                <li key={ret.id}>
                  {onOpenReturn ? (
                    <button
                      type="button"
                      onClick={() => onOpenReturn(ret.id)}
                      className="flex w-full items-start justify-between gap-3 rounded-md px-0.5 py-0.5 text-left text-xs hover:bg-zinc-50"
                    >
                      {content}
                    </button>
                  ) : (
                    <div className="flex items-start justify-between gap-3 text-xs">{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </MovementSection>

      <MovementSection title={t.children}>
        {children.length === 0 ? (
          <p className="text-xs text-zinc-400">{t.noChildren}</p>
        ) : (
          <ul className="space-y-2">
            {children.map((child) => (
              <li key={child.id} className="rounded-md border border-zinc-100 bg-white px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenOrder(child.id)}
                    className="min-w-0 text-left text-xs font-medium text-sky-700 hover:text-sky-900"
                  >
                    №{child.orderNumber}
                  </button>
                  <span className="shrink-0 text-xs tabular-nums text-zinc-800">
                    {formatOrderAmount(child.totalAmount, child.currency, child.exchangeRate)}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <StatusBadge
                    variant="order"
                    status="—"
                    orderStage={child.orderStage ?? null}
                  />
                  <PaymentStatusBadge status={child.paymentStatus} />
                </div>
                {child.counts.payments === 0 && parentHasPayments && parentOrderNumber ? (
                  <p className="mt-1.5 text-[11px] text-zinc-400">
                    {t.paymentsOnParent.replace("{number}", parentOrderNumber)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </MovementSection>
    </div>
  );
}

function MovementSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
      {children}
    </div>
  );
}
