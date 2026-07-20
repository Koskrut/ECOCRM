"use client";

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EntityModalShell } from "@/components/modals/EntityModalShell";
import { EntitySection } from "@/components/sections/EntitySection";
import { SearchableSelectLite, type Option } from "@/components/inputs/SearchableSelectLite";
import { FixedDropdownPortal } from "@/components/overlays/FixedDropdownPortal";
import { apiHttp } from "@/lib/api/client";
import { useMaxWidthMedia } from "@/lib/use-max-width-media";
import { formatOrderAmount } from "@/lib/formatOrderAmount";
import { isForeignOrderCurrency, orderCurrencySymbol } from "@/lib/base-currency";
import { formatDate, formatDateTime } from "@/lib/crmDatetime";
import { OrderPaymentBlock } from "./OrderPaymentBlock";
import { OrderClientBalancePanel, OrderReturnSettlementDialog } from "./OrderClientBalancePanel";
import { OrderTimeline } from "./OrderTimeline";
import { TtnModal } from "./TtnModal";
import { EntityTasksList } from "@/components/EntityTasksList";
import { EntityChangeHistoryPanel } from "@/components/EntityChangeHistoryPanel";
import { tasksApi, ACTIVE_TASK_STATUSES } from "@/lib/api/resources/tasks";
import { ModuleIds } from "@/lib/modules/module-ids";
import { useModules } from "@/lib/modules/useModules";
import { useConfirm, useToast } from "@/components/feedback";
import { TtnStatusBadge } from "@/components/TtnStatusBadge";
import {
  computeLineTotal,
  computeOrderGrossSubtotal,
  computeOrderLineDiscountSum,
} from "@/lib/order-line-total";
import type { FxVarianceSnapshot } from "@/lib/api/resources/orders";
import { FxWriteOffModal } from "@/app/payments/FxWriteOffModal";
import { strings } from "@/locales";

const t = strings.orders.modal;

// =====================
// Small local UI helpers
// =====================

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Small numeric pill for modal sub-tabs (e.g. Items / Activity / Tasks). Hidden when count is 0. */
function TabCountBubble({ count, active }: { count: number; active: boolean }) {
  if (count <= 0) return null;
  const label = count > 99 ? "99+" : String(count);
  return (
    <span
      className={cx(
        "ml-1.5 inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
        active ? "bg-white/20 text-white" : "bg-zinc-200/90 text-zinc-700",
      )}
      aria-hidden
    >
      {label}
    </span>
  );
}

// =====================
// Types
// =====================

type OrderItem = {
  id: string;
  productId: string;
  productName?: string;
  product?: {
    id: string;
    sku: string;
    name: string;
    unit: string;
    stock?: number;
  };
  qty: number;
  price: number;
  discountPercent?: number;
  lineTotal: number;
};

type ReturnStatus =
  | "REQUESTED"
  | "APPROVED"
  | "IN_TRANSIT_BACK"
  | "RECEIVED_BY_WAREHOUSE"
  | "INSPECTION"
  | "REFUND_OR_ADJUSTMENT"
  | "CLOSED";

const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: "Заявлено",
  APPROVED: "Погоджено",
  IN_TRANSIT_BACK: "В дорозі назад",
  RECEIVED_BY_WAREHOUSE: "Прийнято на склад",
  INSPECTION: "Перевірка",
  REFUND_OR_ADJUSTMENT: "Повернення коштів",
  CLOSED: "Закрито",
};

const NEXT_RETURN_STATUS: Partial<Record<ReturnStatus, ReturnStatus>> = {
  REQUESTED: "APPROVED",
  APPROVED: "IN_TRANSIT_BACK",
  IN_TRANSIT_BACK: "RECEIVED_BY_WAREHOUSE",
  RECEIVED_BY_WAREHOUSE: "INSPECTION",
  INSPECTION: "REFUND_OR_ADJUSTMENT",
  REFUND_OR_ADJUSTMENT: "CLOSED",
};

type OrderDetails = {
  id: string;
  orderNumber: string;
  orderSource?: "CRM" | "STORE" | null;
  parentOrderId?: string | null;
  parent?: { id: string; orderNumber: string } | null;
  children?: Array<{ id: string; orderNumber: string; orderStage?: string | null }>;
  companyId: string | null;
  clientId: string | null;
  contactId: string | null;
  ownerId?: string | null;
  deliveryData?: unknown;
  company?: { id: string; name: string };
  client?: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    externalCode?: string | null;
  };
  contact?: {
    id: string;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    externalCode?: string | null;
  } | null;

  status: string;
  /** Phase 3: main axis for UI */
  orderStage?: string | null;
  legacySource?: string | null;
  deliveryMethod: string | null;
  paymentType?: string | null;
  /** CASH | FOP — способ оплаты (from Bitrix UF_CRM_1753787869056) */
  paymentMethod?: string | null;
  bankAccountId?: string | null;
  bankAccount?: { id: string; name: string } | null;
  warehouseId?: string | null;
  warehouse?: { id: string; name: string } | null;
  documentsRequested?: boolean | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  waybillNumber?: string | null;
  waybillDate?: string | null;
  paidAmount?: number;
  debtAmount?: number;
  /** Available overpayment after return / overpay. */
  creditAmount?: number;
  /** Phase 5: sum of closed return amounts (reduces effective total/debt). */
  returnAdjustmentAmount?: number | null;
  fxWriteOffAmount?: number;
  isFxVarianceCandidate?: boolean;
  fxVariance?: FxVarianceSnapshot;
  /** Reasons why order cannot move to COMPLETED (from API). */
  completionBlockers?: string[];
  /** Phase 4: payment due date for deferred (ISO date string). */
  paymentDueDate?: string | null;

  discountAmount: number;
  subtotalAmount?: number;
  totalAmount: number;
  comment: string | null;
  createdAt: string;
  items: OrderItem[];
  currency: string;
  /** UAH per 1 USD — fixed at order creation. */
  exchangeRate?: number | null;
  /** TTN records (from Bitrix import or NP creation); status from cron sync or NP API */
  ttns?: Array<{
    id: string;
    documentNumber: string;
    statusCode?: string | null;
    statusText?: string | null;
  }>;
  /** Same document number is linked to more than one order (from API). */
  ttnSharedAcrossOrders?: boolean;
  /** Other orders that share the same TTN number. */
  ttnSharedWithOrders?: Array<{ id: string; orderNumber: string }>;
  shipments?: Array<{
    id: string;
    status?: string | null;
    ttns?: Array<{
      id: string;
      documentNumber: string;
      statusCode?: string | null;
      statusText?: string | null;
    }>;
  }>;
};

type StockByWarehouseItem = {
  warehouseId: string;
  warehouseName: string;
  qty: number;
  availableQty?: number;
};

type ProductSearchItem = {
  id: string;
  sku: string;
  name: string;
  unit: string;
  basePrice: number;
  stock?: number;
  availableStock?: number;
  stockByWarehouse?: StockByWarehouseItem[];
};

type ProductsResponse = {
  items: ProductSearchItem[];
  total: number;
  page: number;
  pageSize: number;
};

function stockAtWarehouse(
  p: ProductSearchItem,
  warehouseId: string | null | undefined,
): number | undefined {
  if (!p.stockByWarehouse?.length) return p.availableStock ?? p.stock;
  if (!warehouseId) return p.availableStock ?? p.stock;
  const w = p.stockByWarehouse.find((x) => x.warehouseId === warehouseId);
  return w?.availableQty ?? w?.qty ?? 0;
}

function toIsoDateLocal(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function deferredDueDateFrom(baseIsoLike?: string | null): string {
  const base = baseIsoLike ? new Date(baseIsoLike) : new Date();
  if (Number.isNaN(base.getTime())) return "";
  const due = new Date(base);
  due.setDate(due.getDate() + 10);
  return toIsoDateLocal(due);
}

type CompanyOption = { id: string; name: string };

type ContactOption = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  externalCode?: string | null;
  companyId?: string | null;
};

function formatContactOptionLabel(
  c: Pick<ContactOption, "firstName" | "lastName" | "phone" | "externalCode">,
  opts?: { hasCompany?: boolean },
) {
  const code = c.externalCode?.trim();
  const suffix = [
    c.phone,
    code ? `1С: ${code}` : null,
    opts?.hasCompany ? t.hasCompany : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return `${c.lastName} ${c.firstName} — ${suffix}`;
}

function orderClientExternalCode(
  order: Pick<OrderDetails, "client" | "contact">,
): string | null {
  const fromContact = order.contact?.externalCode?.trim();
  if (fromContact) return fromContact;
  const fromClient = order.client?.externalCode?.trim();
  if (fromClient) return fromClient;
  return null;
}

type TimelineItem = {
  id: string;
  source: "ACTIVITY" | "STATUS";
  type: string;
  title: string;
  body: string;
  occurredAt: string;
  createdAt: string;
  createdBy: string;
};

type TimelineResponse = { items: TimelineItem[] };

type OrderModalProps = {
  apiBaseUrl: string; // "/api"
  orderId: string | null; // null => create mode
  onClose: () => void;
  onSaved?: () => void;
  prefill?: { companyId?: string | null; clientId?: string | null };
  onOpenCompany?: (companyId: string) => void;
  onOpenContact?: (contactId: string) => void;
  /** Role from parent (e.g. from /auth/me on page). When set, used for admin actions and internal fetch is skipped. */
  userRole?: string | null;
  /** Open another order in the same host (e.g. child after split). */
  onOpenOrder?: (orderId: string) => void;
  /** Stacking order for nested modals (default 50; use 60+ when opened over another entity modal). */
  zIndex?: number;
};

// =====================
// Status stepper
// =====================

type StepDef = {
  key: string;
  label: string;
  color: "zinc" | "sky" | "amber" | "emerald" | "red";
};

const MAIN_STAGE_ORDER = [
  "NEW",
  "AWAITING_PAYMENT",
  "AWAITING_STOCK",
  "CONFIRMED",
  "READY_TO_SHIP",
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
] as const;

function isForwardStageTransition(from: string, to: string): boolean {
  if (from === to) return false;
  if (to === "CANCELED") return false;
  const fromIdx = MAIN_STAGE_ORDER.indexOf(from as (typeof MAIN_STAGE_ORDER)[number]);
  const toIdx = MAIN_STAGE_ORDER.indexOf(to as (typeof MAIN_STAGE_ORDER)[number]);
  if (fromIdx >= 0 && toIdx >= 0) return toIdx > fromIdx;
  return to === "COMPLETED";
}

function orderHasTtn(order: OrderDetails | null | undefined): boolean {
  if (!order) return false;
  const npLocal = (order as { deliveryData?: { novaPoshta?: { ttn?: { number?: string } } } })
    ?.deliveryData?.novaPoshta;
  const numFromData = npLocal?.ttn?.number;
  if (numFromData && String(numFromData).trim()) return true;
  if ((order.ttns?.length ?? 0) > 0) return true;
  return (order.shipments ?? []).some((s) => (s.ttns?.length ?? 0) > 0);
}

function isStageTransitionBlocked(
  from: string,
  to: string,
  opts: { paymentType?: string | null; deliveryMethod?: string | null; hasTtn: boolean },
): boolean {
  if (isForwardStageTransition(from, to) && !opts.paymentType) return true;
  if (to === "CONFIRMED" && opts.deliveryMethod === "NOVA_POSHTA" && !opts.hasTtn) return true;
  return false;
}

/** Full orderStage list (canonical order). AWAITING_PAYMENT is hidden in UI unless prepayment or order is already in that stage. */
const ORDER_STAGE_STEPS_ALL: StepDef[] = [
  { key: "NEW", label: "Новий", color: "zinc" },
  { key: "AWAITING_PAYMENT", label: "Очікує оплату", color: "amber" },
  { key: "AWAITING_STOCK", label: "Очікує склад", color: "sky" },
  { key: "CONFIRMED", label: "Підтверджено", color: "sky" },
  { key: "READY_TO_SHIP", label: "Готово до відправки", color: "sky" },
  { key: "SHIPPED", label: "Відправлено", color: "sky" },
  { key: "AWAITING_RECEIPT", label: "Очікує отримання", color: "sky" },
  { key: "RECEIVED", label: "Отримано", color: "emerald" },
  { key: "COMPLETED", label: "Завершено", color: "emerald" },
  { key: "CANCELED", label: "Скасовано", color: "red" },
  { key: "REFUSED", label: "Відмова", color: "red" },
  { key: "RETURN_IN_PROGRESS", label: "Повернення", color: "red" },
];

function stepIndexInSteps(stage: string, steps: StepDef[]) {
  const idx = steps.findIndex((s) => s.key === stage);
  return idx >= 0 ? idx : 0;
}

function Stepper({
  stage,
  onStepClick,
  disabled,
  hasPayment,
  isAdmin,
  isWarehouse,
  paymentType,
  deliveryMethod,
  hasTtn = false,
  debtAmount = 0,
  completionBlockers = [],
}: {
  stage: string;
  onStepClick?: (stepKey: string) => void;
  disabled?: boolean;
  /** When true, payment-related step is shown green (paid). */
  hasPayment?: boolean;
  isAdmin?: boolean;
  isWarehouse?: boolean;
  paymentType?: "PREPAYMENT" | "DEFERRED" | string | null;
  deliveryMethod?: string | null;
  hasTtn?: boolean;
  debtAmount?: number;
  completionBlockers?: string[];
}) {
  const showAwaitingPaymentStep = paymentType === "PREPAYMENT" || stage === "AWAITING_PAYMENT";

  const steps = useMemo(
    () =>
      ORDER_STAGE_STEPS_ALL.filter((s) => s.key !== "AWAITING_PAYMENT" || showAwaitingPaymentStep),
    [showAwaitingPaymentStep],
  );

  const activeIdx = stepIndexInSteps(stage, steps);
  const wheelRef = useRef<HTMLDivElement>(null);
  const wheelItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const wheelRafRef = useRef<number | null>(null);
  const wheelSettleTimerRef = useRef<number | null>(null);
  const managerMenuRef = useRef<HTMLDivElement>(null);
  const suppressScrollApplyUntilRef = useRef<number>(0);
  const lastEmittedKeyRef = useRef<string | null>(null);
  const [managerMenuOpen, setManagerMenuOpen] = useState(false);

  const isCanceled = stage === "CANCELED";
  const isRefused = stage === "REFUSED";
  const isReturning = stage === "RETURN_IN_PROGRESS";

  const centerActiveChip = useCallback(() => {
    const el = wheelRef.current;
    const btn = wheelItemRefs.current[activeIdx];
    if (!el || !btn) return;
    const targetLeft = Math.max(0, btn.offsetLeft + btn.offsetWidth / 2 - el.clientWidth / 2);
    suppressScrollApplyUntilRef.current = Date.now() + 220;
    el.scrollTo({ left: targetLeft, behavior: "auto" });
  }, [activeIdx]);

  useLayoutEffect(() => {
    centerActiveChip();
  }, [centerActiveChip, stage]);

  useEffect(() => {
    const onResize = () => centerActiveChip();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [centerActiveChip]);

  useEffect(() => {
    lastEmittedKeyRef.current = stage;
  }, [stage]);

  const getNearestStepFromScroll = useCallback(
    (el: HTMLDivElement) => {
      const centerX = el.scrollLeft + el.clientWidth / 2;
      let bestIdx = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      steps.forEach((_, idx) => {
        const btn = wheelItemRefs.current[idx];
        if (!btn) return;
        const btnCenter = btn.offsetLeft + btn.offsetWidth / 2;
        const dist = Math.abs(btnCenter - centerX);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });
      return { nearestIdx: bestIdx, nearest: steps[bestIdx], centerX, bestDist };
    },
    [steps],
  );

  useEffect(() => {
    const el = wheelRef.current;
    if (!el) return;
    const onScroll = () => {
      if (wheelRafRef.current != null) cancelAnimationFrame(wheelRafRef.current);
      wheelRafRef.current = requestAnimationFrame(() => {
        const { nearest } = getNearestStepFromScroll(el);

        if (wheelSettleTimerRef.current != null) window.clearTimeout(wheelSettleTimerRef.current);
        wheelSettleTimerRef.current = window.setTimeout(() => {
          if (Date.now() < suppressScrollApplyUntilRef.current) return;
          if (!onStepClick || disabled || !nearest?.key) return;
          if (nearest.key === lastEmittedKeyRef.current) return;
          lastEmittedKeyRef.current = nearest.key;
          onStepClick(nearest.key);
        }, 140);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (wheelRafRef.current != null) cancelAnimationFrame(wheelRafRef.current);
      if (wheelSettleTimerRef.current != null) window.clearTimeout(wheelSettleTimerRef.current);
      wheelRafRef.current = null;
      wheelSettleTimerRef.current = null;
    };
  }, [stage, disabled, onStepClick, getNearestStepFromScroll, steps]);

  const colorClasses = (c: StepDef["color"], stepKey?: string) => {
    const usePaymentGreen = stepKey === "AWAITING_PAYMENT" && hasPayment;
    if (usePaymentGreen) {
      return {
        on: "bg-emerald-600 text-white border-emerald-600",
        off: "bg-zinc-100 text-zinc-600 border-zinc-200",
      };
    }
    switch (c) {
      case "sky":
        return {
          on: "bg-sky-600 text-white border-sky-600",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
      case "amber":
        return {
          on: "bg-amber-500 text-white border-amber-500",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
      case "emerald":
        return {
          on: "bg-emerald-600 text-white border-emerald-600",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
      case "red":
        return {
          on: "bg-red-600 text-white border-red-600",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
      default:
        return {
          on: "bg-zinc-900 text-white border-zinc-900",
          off: "bg-zinc-100 text-zinc-600 border-zinc-200",
        };
    }
  };

  const isDone = (s: StepDef, idx: number) => {
    if (isCanceled) return s.key === "CANCELED";
    if (isRefused) return s.key === "REFUSED";
    if (isReturning) return s.key === "RETURN_IN_PROGRESS";
    return idx <= activeIdx;
  };

  const roleBasedTransitionOptions = useMemo(() => {
    const blocksCompletion = debtAmount > 0.009 || completionBlockers.length > 0;
    const filterBlocked = (items: typeof ORDER_STAGE_STEPS_ALL) =>
      items.filter(
        (s) =>
          !isStageTransitionBlocked(stage, s.key, {
            paymentType,
            deliveryMethod,
            hasTtn,
          }),
      );
    const filterCompletion = (items: typeof ORDER_STAGE_STEPS_ALL) =>
      blocksCompletion ? items.filter((s) => s.key !== "COMPLETED") : items;

    if (isAdmin)
      return filterBlocked(filterCompletion(ORDER_STAGE_STEPS_ALL.filter((s) => s.key !== stage)));
    if (isWarehouse) {
      if (stage === "CONFIRMED") {
        return filterBlocked(ORDER_STAGE_STEPS_ALL.filter((s) => s.key === "READY_TO_SHIP"));
      }
      if (stage === "READY_TO_SHIP") {
        return filterBlocked(ORDER_STAGE_STEPS_ALL.filter((s) => s.key === "CONFIRMED"));
      }
      return [];
    }
    const specials = new Set(["CANCELED", "REFUSED", "RETURN_IN_PROGRESS"]);
    return filterBlocked(
      filterCompletion(
        steps.filter((s, idx) => s.key !== stage && (idx > activeIdx || specials.has(s.key))),
      ),
    );
  }, [
    isAdmin,
    isWarehouse,
    stage,
    activeIdx,
    steps,
    debtAmount,
    completionBlockers,
    paymentType,
    deliveryMethod,
    hasTtn,
  ]);

  useEffect(() => {
    if (!managerMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!managerMenuRef.current?.contains(e.target as Node)) setManagerMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    return () => window.removeEventListener("pointerdown", onDown);
  }, [managerMenuOpen]);

  return (
    <div className="border-b border-zinc-200 py-3">
      <div className="md:hidden">
        <div className="relative">
          {roleBasedTransitionOptions.length > 0 ? (
            <div ref={managerMenuRef} className="absolute left-0 top-0 z-20">
              <button
                type="button"
                onClick={() => setManagerMenuOpen((v) => !v)}
                disabled={disabled}
                aria-label={t.openStatusList}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 shadow-sm disabled:opacity-50"
              >
                ▾
              </button>
              {managerMenuOpen ? (
                <div className="mt-1 min-w-[180px] rounded-md border border-zinc-200 bg-white p-1 shadow-lg">
                  {roleBasedTransitionOptions.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setManagerMenuOpen(false);
                        onStepClick?.(opt.key);
                      }}
                      className="block w-full rounded px-2 py-1.5 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div
            ref={wheelRef}
            className="overflow-x-auto overflow-y-hidden snap-x snap-mandatory [mask-image:linear-gradient(to_right,transparent,black_10%,black_90%,transparent)] [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex items-center gap-0.5 px-[calc(50%-3.5rem)]">
              {steps.map((s, idx) => {
                const isActive = s.key === stage;
                const distance = Math.abs(idx - activeIdx);
                return (
                  <button
                    key={s.key}
                    ref={(el) => {
                      wheelItemRefs.current[idx] = el;
                    }}
                    type="button"
                    onClick={() => {
                      if (!onStepClick || disabled) return;
                      const next = steps[Math.min(activeIdx + 1, steps.length - 1)];
                      const target = isActive ? (next?.key ?? s.key) : s.key;
                      lastEmittedKeyRef.current = target;
                      onStepClick(target);
                    }}
                    disabled={disabled || !onStepClick}
                    className={cx(
                      "block h-10 w-28 shrink-0 snap-center rounded-md px-1 text-center text-sm transition disabled:cursor-not-allowed",
                      isActive ? "font-semibold text-zinc-900" : "font-medium text-zinc-600",
                      distance >= 2 ? "opacity-40" : distance === 1 ? "opacity-70" : "opacity-100",
                    )}
                  >
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="hidden md:block">
        <div className="-mx-1 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
          <div className="flex min-w-max flex-nowrap items-center gap-2 px-1">
            {steps.map((s, idx) => {
              const done = isDone(s, idx);
              const cls = colorClasses(s.color, s.key);
              const canClick = onStepClick && !disabled;
              const showOn = s.key === "AWAITING_PAYMENT" && hasPayment ? true : done;
              const badge = (
                <Badge className={`whitespace-nowrap ${showOn ? cls.on : cls.off}`}>{s.label}</Badge>
              );
              return canClick ? (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => onStepClick(s.key)}
                  className="shrink-0 rounded focus:outline-none focus:ring-2 focus:ring-zinc-400"
                >
                  {badge}
                </button>
              ) : (
                <span key={s.key} className="shrink-0">
                  {badge}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================
// Main
// =====================

type EditingField =
  | null
  | "company"
  | "client"
  | "paymentType"
  | "paymentMethod"
  | "paymentDueDate"
  | "bankAccount"
  | "warehouse"
  | "discount"
  | "comment";

export function OrderModal({
  apiBaseUrl,
  orderId,
  onClose,
  onSaved,
  prefill,
  onOpenCompany,
  onOpenContact,
  userRole: userRoleProp,
  onOpenOrder,
  zIndex = 50,
}: OrderModalProps) {
  const { pushToast } = useToast();
  const { confirm } = useConfirm();
  const isCreate = orderId === null;

  const [order, setOrder] = useState<OrderDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState<EditingField>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [showFxWriteOff, setShowFxWriteOff] = useState(false);

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [users, setUsers] = useState<Array<{ id: string; fullName: string; email: string }>>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // local editable values
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [deliveryMethod, setDeliveryMethod] = useState<string>("PICKUP");
  const [paymentType, setPaymentType] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string | null>("FOP");
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string }>>([]);
  const [fopAccounts, setFopAccounts] = useState<Array<{ id: string; name: string }>>([]);
  /** From GET /bank/accounts/for-order — user's default FOP id (if visible). */
  const [forOrderDefaultBankId, setForOrderDefaultBankId] = useState<string | null>(null);
  const [documentsRequested, setDocumentsRequested] = useState<boolean>(false);
  const [paymentDueDate, setPaymentDueDate] = useState<string>("");
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [showDiscounts, setShowDiscounts] = useState(false);
  const [discountOptions, setDiscountOptions] = useState<number[]>([5, 10, 15, 20, 25, 30]);
  const [comment, setComment] = useState<string>("");

  // Add Item
  const [showAddForm, setShowAddForm] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);
  const itemsCardRef = useRef<HTMLDivElement>(null);
  const qtyInputRef = useRef<HTMLInputElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const qtyControlsWrapRef = useRef<HTMLDivElement>(null);
  const qtyIncBtnRef = useRef<HTMLButtonElement>(null);
  const qtyDecBtnRef = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductSearchItem | null>(null);
  const isNarrowViewport = useMaxWidthMedia(767);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submittingItem, setSubmittingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<{
    itemId: string;
    field: "qty" | "price";
    value: string;
  } | null>(null);

  // product search debounce
  const [, setTimeline] = useState<TimelineItem[]>([]);
  const [, setTimelineLoading] = useState(false);
  const [, setTimelineError] = useState<string | null>(null);
  /** Activity tab badge; kept in sync with refreshTimeline + OrderTimeline. */
  const [activityTabCount, setActivityTabCount] = useState(0);
  /** Tasks tab badge; prefetch + EntityTasksList updates. */
  const [tasksTabCount, setTasksTabCount] = useState(0);

  // TTN
  const [showTtnModal, setShowTtnModal] = useState(false);
  const [ttnModalMode, setTtnModalMode] = useState<"create" | "edit">("create");
  const [ttnModalShipmentId, setTtnModalShipmentId] = useState<string | undefined>();
  const [ttnModalTtnId, setTtnModalTtnId] = useState<string | undefined>();

  const openTtnCreate = useCallback(() => {
    setTtnModalMode("create");
    setTtnModalShipmentId(undefined);
    setTtnModalTtnId(undefined);
    setShowTtnModal(true);
  }, []);

  const openTtnEdit = useCallback((opts?: { shipmentId?: string; ttnId?: string }) => {
    setTtnModalMode("edit");
    setTtnModalShipmentId(opts?.shipmentId);
    setTtnModalTtnId(opts?.ttnId);
    setShowTtnModal(true);
  }, []);

  // Phase 5: returns
  const [orderReturns, setOrderReturns] = useState<
    Array<{
      id: string;
      status: ReturnStatus;
      requestedAt: string;
      creditAmount?: number | null;
      refundAmount?: number | null;
      settledAt?: string | null;
      items?: { qtyReturned: number; orderItemId: string }[];
    }>
  >([]);
  const [returnsLoading, setReturnsLoading] = useState(false);
  const [showCreateReturnForm, setShowCreateReturnForm] = useState(false);
  const [createReturnSubmitting, setCreateReturnSubmitting] = useState(false);
  const [returnItemQtys, setReturnItemQtys] = useState<Record<string, number>>({});
  const [returnsDocsMenuOpen, setReturnsDocsMenuOpen] = useState(false);
  const returnsDocsMenuRef = useRef<HTMLDivElement>(null);
  const [returnStatusUpdatingId, setReturnStatusUpdatingId] = useState<string | null>(null);
  const [pendingReturnSettlement, setPendingReturnSettlement] = useState<{
    returnId: string;
    nextStatus: ReturnStatus;
  } | null>(null);

  const [statusUpdating, setStatusUpdating] = useState(false);
  const [splittingByStock, setSplittingByStock] = useState(false);
  const [leftTab, setLeftTab] = useState<"main" | "items" | "activity" | "change-history" | "tasks">("main");

  const canClose = !saving && !submittingItem && !statusUpdating && !deleting && !splittingByStock;

  const effectiveRole = userRoleProp ?? userRole;
  const isAdmin = effectiveRole != null && String(effectiveRole).trim().toUpperCase() === "ADMIN";
  const isWarehouse =
    effectiveRole != null && String(effectiveRole).trim().toUpperCase() === "WAREHOUSE";
  const canEditLineDiscounts = !isWarehouse;
  const orderLineDiscountSum = useMemo(
    () => (order?.items ? computeOrderLineDiscountSum(order.items) : 0),
    [order?.items],
  );
  const orderGrossSubtotal = useMemo(
    () => (order?.items ? computeOrderGrossSubtotal(order.items) : 0),
    [order?.items],
  );
  const { status: modulesStatus, effective: moduleEffective } = useModules();
  const npModuleEffective = modulesStatus !== "ready" || moduleEffective(ModuleIds.NovaPoshta);

  const canSplitByStock = useMemo(() => {
    if (!order?.items?.length) return false;
    const blocked = new Set([
      "SHIPPED",
      "AWAITING_RECEIPT",
      "RECEIVED",
      "COMPLETED",
      "CANCELED",
      "REFUSED",
      "RETURN_IN_PROGRESS",
    ]);
    return !blocked.has(order.orderStage ?? "");
  }, [order]);

  const fetchCompanies = useCallback(async () => {
    setLoadingCompanies(true);
    try {
      const r = await fetch(`${apiBaseUrl}/companies?page=1&pageSize=200`, { cache: "no-store" });
      if (!r.ok) {
        setCompanies([]);
        return;
      }
      const data = await r.json();
      setCompanies(Array.isArray(data?.items) ? data.items : []);
    } finally {
      setLoadingCompanies(false);
    }
  }, [apiBaseUrl]);

  const fetchContacts = useCallback(
    async (cid: string | null) => {
      setLoadingContacts(true);
      setContacts([]);
      try {
        const url = cid
          ? `${apiBaseUrl}/contacts?companyId=${encodeURIComponent(cid)}&page=1&pageSize=200`
          : `${apiBaseUrl}/contacts?page=1&pageSize=200`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) return;
        const data = await r.json();
        setContacts(Array.isArray(data?.items) ? data.items : []);
      } finally {
        setLoadingContacts(false);
      }
    },
    [apiBaseUrl],
  );

  const searchContacts = useCallback(
    async (query: string, cid: string | null) => {
      setLoadingContacts(true);
      setContacts([]);
      try {
        const params = new URLSearchParams();
        if (cid) params.set("companyId", cid);
        if (query.trim()) params.set("q", query.trim());
        params.set("page", "1");
        params.set("pageSize", "50");
        const r = await fetch(`${apiBaseUrl}/contacts?${params}`, {
          credentials: "include",
          cache: "no-store",
        });
        if (!r.ok) return;
        const data = await r.json();
        setContacts(Array.isArray(data?.items) ? data.items : []);
      } finally {
        setLoadingContacts(false);
      }
    },
    [apiBaseUrl],
  );

  const fetchUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await apiHttp.get<{ items: { id: string; fullName: string; email: string }[] }>(
        "/users",
      );
      const loaded = Array.isArray(res.data?.items) ? res.data.items : [];
      setUsers(loaded);
    } catch {
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const onContactSearchQueryChange = useCallback(
    (q: string) => {
      searchContacts(q, companyId);
    },
    [searchContacts, companyId],
  );

  const applyOrderToState = useCallback((data: OrderDetails) => {
    const orderWithFields = {
      ...data,
      paymentMethod: data.paymentMethod ?? null,
      documentsRequested: data.documentsRequested ?? false,
    };
    setOrder(orderWithFields);
    setCompanyId(data.companyId ?? null);
    setClientId(data.clientId ?? null);
    setDeliveryMethod(data.deliveryMethod ?? "PICKUP");
    setPaymentType(data.paymentType ?? null);
    setPaymentMethod(data.paymentMethod ?? null);
    setBankAccountId(data.bankAccountId ?? null);
    setWarehouseId(data.warehouseId ?? null);
    setDocumentsRequested(data.documentsRequested ?? false);
    setPaymentDueDate(
      data.paymentDueDate
        ? (typeof data.paymentDueDate === "string"
            ? data.paymentDueDate
            : new Date(data.paymentDueDate).toISOString()
          ).slice(0, 10)
        : "",
    );
    setDiscountAmount(Number(data.discountAmount ?? 0));
    setComment(data.comment ?? "");
  }, []);

  const refreshOrder = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`Не вдалося завантажити замовлення (${r.status})`);
      const data = (await r.json()) as OrderDetails;
      applyOrderToState(data);
    } catch (e) {
      setOrder(null);
      setError(e instanceof Error ? e.message : "Не вдалося завантажити замовлення");
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl, orderId, applyOrderToState]);

  const refreshTimeline = useCallback(async () => {
    if (!orderId) return;
    setTimelineLoading(true);
    setTimelineError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}/timeline`, { cache: "no-store" });
      if (!r.ok) throw new Error(`Не вдалося завантажити таймлайн (${r.status})`);
      const data = (await r.json()) as TimelineResponse;
      const tItems = data.items || [];
      setTimeline(tItems);
      setActivityTabCount(tItems.length);
    } catch (e) {
      setTimeline([]);
      setActivityTabCount(0);
      setTimelineError(e instanceof Error ? e.message : "Не вдалося завантажити таймлайн");
    } finally {
      setTimelineLoading(false);
    }
  }, [apiBaseUrl, orderId]);

  const refreshReturns = useCallback(async () => {
    if (!orderId) return;
    setReturnsLoading(true);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}/returns`, {
        cache: "no-store",
        credentials: "include",
      });
      if (!r.ok) return setOrderReturns([]);
      const data = (await r.json()) as {
        items?: Array<{
          id: string;
          status: ReturnStatus;
          requestedAt: string;
          items?: { qtyReturned: number; orderItemId: string }[];
        }>;
      };
      setOrderReturns(data.items ?? []);
    } catch {
      setOrderReturns([]);
    } finally {
      setReturnsLoading(false);
    }
  }, [apiBaseUrl, orderId]);

  const updateReturnStatus = useCallback(
    async (
      returnId: string,
      status: ReturnStatus,
      settlement?: {
        type: "CREDIT" | "REFUND" | "SPLIT";
        creditAmount?: number;
        refundAmount?: number;
      },
    ) => {
      setReturnStatusUpdatingId(returnId);
      try {
        const r = await fetch(`/api/order-returns/${returnId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, settlement }),
          credentials: "include",
        });
        if (!r.ok) {
          const errData = await r.json().catch(() => ({}));
          throw new Error(
            (errData?.message as string) || `Не вдалося оновити статус повернення (${r.status})`,
          );
        }
        await Promise.all([refreshReturns(), refreshOrder()]);
        onSaved?.();
      } finally {
        setReturnStatusUpdatingId(null);
      }
    },
    [refreshReturns, refreshOrder, onSaved],
  );

  const advanceReturnStatus = useCallback(
    async (returnId: string, currentStatus: ReturnStatus) => {
      const nextStatus = NEXT_RETURN_STATUS[currentStatus];
      if (!nextStatus) return;

      if (nextStatus === "CLOSED" && currentStatus === "REFUND_OR_ADJUSTMENT") {
        try {
          const previewRes = await fetch(`/api/order-returns/${returnId}/settlement-preview`, {
            credentials: "include",
            cache: "no-store",
          });
          if (previewRes.ok) {
            const preview = (await previewRes.json()) as { requiresSettlement?: boolean };
            if (preview.requiresSettlement) {
              setPendingReturnSettlement({ returnId, nextStatus });
              return;
            }
          }
        } catch {
          /* proceed without preview */
        }
      }

      await updateReturnStatus(returnId, nextStatus);
    },
    [updateReturnStatus],
  );

  const splitOrderByStock = useCallback(async () => {
    if (!orderId || !order) return;
    const ok = await confirm({
      title: "Розділити замовлення",
      message:
        "Розділити замовлення за залишками на складі? Нестача піде в нове дочірнє замовлення. Оплати залишаться на поточному замовленні.",
      confirmText: "Розділити",
    });
    if (!ok) return;
    setSplittingByStock(true);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}/split-by-stock`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await r.json().catch(() => null)) as {
        parent?: OrderDetails;
        child?: OrderDetails;
        message?: string | string[];
      } | null;
      if (!r.ok) {
        const m = body?.message;
        const msg = Array.isArray(m) ? m.join(", ") : m || `Помилка ${r.status}`;
        throw new Error(msg);
      }
      if (body?.parent) applyOrderToState(body.parent);
      await refreshTimeline();
      onSaved?.();
      const child = body?.child;
      if (child?.id && onOpenOrder) {
        const openChild = await confirm({
          title: "Створено дочірнє замовлення",
          message: `Створено дочірнє замовлення №${child.orderNumber}. Відкрити зараз?`,
          confirmText: "Відкрити",
        });
        if (openChild) onOpenOrder(child.id);
      } else if (child?.orderNumber) {
        pushToast(`Створено дочірнє замовлення №${child.orderNumber}`, "success");
      }
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Не вдалося розділити", "error");
    } finally {
      setSplittingByStock(false);
    }
  }, [
    orderId,
    order,
    apiBaseUrl,
    applyOrderToState,
    refreshTimeline,
    onSaved,
    onOpenOrder,
    confirm,
    pushToast,
  ]);

  useEffect(() => {
    if (!orderId || isCreate) {
      setTasksTabCount(0);
      return;
    }
    let cancelled = false;
    void tasksApi
      .list({ orderId, pageSize: 1, status: ACTIVE_TASK_STATUSES })
      .then((r) => {
        if (!cancelled) setTasksTabCount(r.total);
      })
      .catch(() => {
        if (!cancelled) setTasksTabCount(0);
      });
    return () => {
      cancelled = true;
    };
  }, [orderId, isCreate]);

  useEffect(() => {
    if (!returnsDocsMenuOpen) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const el = returnsDocsMenuRef.current;
      const t = e.target;
      if (el && t instanceof Node && !el.contains(t)) setReturnsDocsMenuOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [returnsDocsMenuOpen]);

  /** Phase 3: PATCH /orders/:id/stage with toStage */
  const setOrderStage = useCallback(
    async (toStage: string) => {
      if (!orderId || !order) return;
      const currentStage = order.orderStage ?? order.status;
      const effectivePaymentType = order.paymentType ?? paymentType ?? null;
      const effectiveDeliveryMethod = order.deliveryMethod ?? deliveryMethod ?? null;
      const hasTtn = orderHasTtn(order);
      if (
        isStageTransitionBlocked(currentStage, toStage, {
          paymentType: effectivePaymentType,
          deliveryMethod: effectiveDeliveryMethod,
          hasTtn,
        })
      ) {
        if (isForwardStageTransition(currentStage, toStage) && !effectivePaymentType) {
          pushToast("Оберіть умови оплати перед зміною етапу", "error");
          return;
        }
        if (toStage === "CONFIRMED" && effectiveDeliveryMethod === "NOVA_POSHTA" && !hasTtn) {
          pushToast("Створіть ТТН перед підтвердженням замовлення", "error");
          return;
        }
      }
      setStatusUpdating(true);
      try {
        const r = await fetch(`${apiBaseUrl}/orders/${orderId}/stage`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ toStage }),
          credentials: "include",
        });
        if (!r.ok) {
          const errData = await r.json().catch(() => ({}));
          throw new Error((errData?.message as string) || `Не вдалося оновити етап (${r.status})`);
        }
        await refreshOrder();
        onSaved?.();
      } catch (e) {
        pushToast(e instanceof Error ? e.message : "Не вдалося оновити етап", "error");
      } finally {
        setStatusUpdating(false);
      }
    },
    [
      apiBaseUrl,
      deliveryMethod,
      order,
      orderId,
      paymentType,
      refreshOrder,
      onSaved,
      pushToast,
    ],
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [whRes, fopRes] = await Promise.all([
          fetch(`${apiBaseUrl}/warehouses`, { cache: "no-store", credentials: "include" }).then(
            (r) => (r.ok ? r.json() : []),
          ),
          fetch(`${apiBaseUrl}/bank/accounts/for-order`, {
            cache: "no-store",
            credentials: "include",
          }).then((r) => (r.ok ? r.json() : null)),
        ]);
        if (!mounted) return;
        setWarehouses(Array.isArray(whRes) ? whRes : []);
        let list: Array<{ id: string; name: string }> = [];
        let defBank: string | null = null;
        if (Array.isArray(fopRes)) {
          list = fopRes;
        } else if (fopRes && typeof fopRes === "object") {
          const acc = (fopRes as { accounts?: unknown }).accounts;
          list = Array.isArray(acc) ? (acc as Array<{ id: string; name: string }>) : [];
          const d = (fopRes as { defaultBankAccountId?: string | null }).defaultBankAccountId;
          defBank = typeof d === "string" && d.trim() ? d.trim() : null;
        }
        setFopAccounts(list);
        setForOrderDefaultBankId(defBank);
        if (isCreate && Array.isArray(whRes) && whRes.length > 0) {
          setWarehouseId((prev) => {
            if (prev != null) return prev;
            const sorted = [...whRes].sort(
              (a: { sortOrder?: number }, b: { sortOrder?: number }) =>
                (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
            );
            return sorted[0]!.id;
          });
        }
      } catch {
        if (mounted) {
          setWarehouses([]);
          setFopAccounts([]);
          setForOrderDefaultBankId(null);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [apiBaseUrl, isCreate]);

  /** Create mode in modal: pick default FOP from for-order (explicit id or first in list). */
  useEffect(() => {
    if (!isCreate || paymentMethod !== "FOP" || fopAccounts.length === 0) return;
    const pick =
      forOrderDefaultBankId && fopAccounts.some((a) => a.id === forOrderDefaultBankId)
        ? forOrderDefaultBankId
        : fopAccounts[0].id;
    setBankAccountId((prev) => (prev == null ? pick : prev));
  }, [isCreate, paymentMethod, fopAccounts, forOrderDefaultBankId]);

  // init
  useEffect(() => {
    setError(null);
    setTimelineError(null);
    setEditing(null);
    setEditingItem(null);
    setReturnsDocsMenuOpen(false);
    setShowAddForm(false);
    setSelectedProduct(null);
    setSearch("");
    setSearchResults([]);
    setQty(1);
    setPrice(0);
    setSubmitError(null);

    if (isCreate) {
      const pCompanyId = prefill?.companyId ?? null;
      const pClientId = prefill?.clientId ?? null;
      setCompanyId(pCompanyId);
      setClientId(pClientId);
      setDeliveryMethod("PICKUP");
      setPaymentType(null);
      setPaymentDueDate("");
      setPaymentMethod("FOP");
      setBankAccountId(null);
      setDocumentsRequested(false);
      setDiscountAmount(0);
      setComment("");
      void fetchCompanies();
      void fetchContacts(pCompanyId);
      setOrder(null);
      setTimeline([]);
      setActivityTabCount(0);
      setTasksTabCount(0);
      return;
    }

    void refreshOrder();
    void refreshTimeline();
    void refreshReturns();
    void fetchUsers();
  }, [
    isCreate,
    orderId,
    prefill?.companyId,
    prefill?.clientId,
    fetchCompanies,
    fetchContacts,
    refreshOrder,
    refreshReturns,
    refreshTimeline,
    fetchUsers,
  ]);

  useEffect(() => {
    if (userRoleProp != null) return;
    apiHttp
      .get<{ user?: { role?: string } }>("/auth/me")
      .then((res) => {
        const role = res.data?.user?.role ?? null;
        setUserRole(role);
      })
      .catch(() => {
        setUserRole(null);
      });
  }, [userRoleProp]);

  useEffect(() => {
    if (isCreate) return;
    apiHttp
      .get<{ percents: number[] }>("/settings/order-discounts")
      .then((res) => {
        const percents = res.data?.percents;
        if (Array.isArray(percents) && percents.length > 0) {
          setDiscountOptions(percents);
        }
      })
      .catch(() => {
        /* keep defaults */
      });
  }, [isCreate, orderId]);

  const handleEscape = useCallback(() => {
    if (editingItem) {
      setEditingItem(null);
      return true;
    }
    if (editing) {
      setEditing(null);
      return true;
    }
    if (returnsDocsMenuOpen) {
      setReturnsDocsMenuOpen(false);
      return true;
    }
    return false;
  }, [editing, editingItem, returnsDocsMenuOpen]);

  const patchOrderItem = useCallback(
    async (itemId: string, payload: { qty?: number; price?: number; discountPercent?: number }) => {
      if (!orderId) return;
      setEditingItem(null);
      setSaving(true);
      setOrder((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((it) => {
            if (it.id !== itemId) return it;
            const qty = payload.qty ?? it.qty;
            const price = payload.price ?? it.price;
            const discountPercent =
              payload.discountPercent !== undefined
                ? payload.discountPercent
                : (it.discountPercent ?? 0);
            return {
              ...it,
              qty,
              price,
              discountPercent,
              lineTotal: computeLineTotal(qty, price, discountPercent),
            };
          }),
        };
      });
      try {
        const body: { qty?: number; price?: number; discountPercent?: number } = {};
        if (payload.qty !== undefined) body.qty = Number(payload.qty);
        if (payload.price !== undefined) body.price = Number(payload.price);
        if (payload.discountPercent !== undefined) {
          body.discountPercent = Number(payload.discountPercent);
        }
        const r = await fetch(`${apiBaseUrl}/orders/${orderId}/items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
          cache: "no-store",
        });
        if (!r.ok) {
          const errData = await r.json().catch(() => ({}));
          throw new Error((errData?.message as string) || `Не вдалося оновити позицію (${r.status})`);
        }
        const data = (await r.json()) as OrderDetails;
        // Use server response as source of truth (do not overlay payload — masks failed persistence)
        if (data?.items) {
          applyOrderToState(data);
        } else {
          await refreshOrder();
        }
        await refreshTimeline();
        onSaved?.();
      } catch (e) {
        pushToast(e instanceof Error ? e.message : "Не вдалося зберегти", "error");
        await refreshOrder();
      } finally {
        setSaving(false);
      }
    },
    [apiBaseUrl, applyOrderToState, onSaved, orderId, pushToast, refreshOrder, refreshTimeline],
  );

  const deleteOrderItem = useCallback(
    async (itemId: string) => {
      if (!orderId) return;
      const ok = await confirm({
        title: "Видалити позицію",
        message: "Видалити позицію?",
        confirmText: "Видалити",
        destructive: true,
      });
      if (!ok) return;
      setSaving(true);
      try {
        const r = await fetch(`${apiBaseUrl}/orders/${orderId}/items/${itemId}`, {
          method: "DELETE",
          credentials: "include",
          cache: "no-store",
        });
        if (!r.ok) throw new Error(`Не вдалося видалити позицію (${r.status})`);
        setEditingItem(null);
        await Promise.all([refreshOrder(), refreshTimeline()]);
        onSaved?.();
      } catch (e) {
        pushToast(e instanceof Error ? e.message : "Не вдалося видалити", "error");
        await refreshOrder();
      } finally {
        setSaving(false);
      }
    },
    [apiBaseUrl, onSaved, orderId, confirm, pushToast, refreshOrder, refreshTimeline],
  );

  const patchOrder = useCallback(
    async (payload: Record<string, unknown>, options?: { silent?: boolean }) => {
      if (!orderId) return;
      const silent = options?.silent === true;
      if (!silent) setSaving(true);
      try {
        const r = await fetch(`${apiBaseUrl}/orders/${orderId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          credentials: "include",
          cache: "no-store",
        });
        const resBody = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(resBody?.message || `Не вдалося оновити замовлення (${r.status})`);
        }
        if (resBody && typeof resBody === "object" && "id" in resBody) {
          applyOrderToState(resBody as OrderDetails);
        }
        onSaved?.();
      } catch (e) {
        if (!silent) {
          pushToast(e instanceof Error ? e.message : "Не вдалося зберегти", "error");
          await refreshOrder();
        }
      } finally {
        if (!silent) setSaving(false);
      }
    },
    [apiBaseUrl, onSaved, orderId, pushToast, refreshOrder, applyOrderToState],
  );

  /**
   * «Новый заказ» на странице сначала создаётся через POST и открывается с реальным orderId
   * (isCreate === false). Тогда подставляем ФОП сотрудника, если в заказе ещё нет счёта.
   */
  useEffect(() => {
    if (!orderId || isCreate || !order) return;
    if (order.id !== orderId) return;
    if (order.bankAccountId) return;
    const pm = order.paymentMethod ?? paymentMethod ?? "FOP";
    if (pm !== "FOP") return;
    if (fopAccounts.length === 0) return;

    const pick =
      forOrderDefaultBankId && fopAccounts.some((a) => a.id === forOrderDefaultBankId)
        ? forOrderDefaultBankId
        : fopAccounts[0].id;
    const accName = fopAccounts.find((a) => a.id === pick)?.name;

    void (async () => {
      await patchOrder({ bankAccountId: pick }, { silent: true });
      setBankAccountId(pick);
      setOrder((prev) =>
        prev && prev.id === order.id
          ? {
              ...prev,
              bankAccountId: pick,
              bankAccount: accName ? { id: pick, name: accName } : prev.bankAccount,
            }
          : prev,
      );
    })();
  }, [orderId, isCreate, order, paymentMethod, fopAccounts, forOrderDefaultBankId, patchOrder]);

  /**
   * When opening existing order from Contact card, enforce prefilled client linkage once
   * if order was created without clientId due transient API/UI mismatch.
   */
  useEffect(() => {
    if (!orderId || isCreate || !order) return;
    const forcedClientId = prefill?.clientId ?? null;
    if (!forcedClientId) return;
    if (order.clientId) return;
    void patchOrder(
      {
        clientId: forcedClientId,
        contactId: forcedClientId,
        ...(prefill?.companyId ? { companyId: prefill.companyId } : {}),
      },
      { silent: true },
    );
  }, [orderId, isCreate, order, patchOrder, prefill?.clientId, prefill?.companyId]);

  const createOrder = useCallback(async () => {
    if (!paymentType) {
      pushToast("Оберіть тип оплати", "error");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch(`${apiBaseUrl}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          clientId,
          contactId: clientId,
          deliveryMethod,
          paymentType,
          paymentDueDate:
            paymentType === "DEFERRED" ? paymentDueDate.trim() || deferredDueDateFrom(null) : null,
          paymentMethod: ((paymentMethod ?? "FOP") === "CASH" ? "CASH" : "FOP") as "CASH" | "FOP",
          bankAccountId: (paymentMethod ?? "FOP") === "FOP" ? bankAccountId : null,
          warehouseId: warehouseId ?? undefined,
          documentsRequested: documentsRequested,
          comment: comment.trim() ? comment.trim() : null,
          discountAmount: Number(discountAmount) || 0,
        }),
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.message || `Не вдалося створити замовлення (${r.status})`);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      pushToast(e instanceof Error ? e.message : "Не вдалося створити замовлення", "error");
    } finally {
      setSaving(false);
    }
  }, [
    apiBaseUrl,
    bankAccountId,
    clientId,
    comment,
    companyId,
    deliveryMethod,
    discountAmount,
    documentsRequested,
    paymentDueDate,
    paymentMethod,
    paymentType,
    pushToast,
    warehouseId,
    onClose,
    onSaved,
  ]);

  // product search debounce
  useEffect(() => {
    if (!showAddForm || !orderId || selectedProduct) return;
    if (search.trim().length === 0) {
      setSearchResults([]);
      setSearchError(null);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError(null);
      try {
        const r = await fetch(
          `${apiBaseUrl}/products?catalog=1&search=${encodeURIComponent(search)}&page=1&pageSize=10`,
          { cache: "no-store" },
        );
        if (!r.ok) throw new Error(`Не вдалося завантажити товари (${r.status})`);
        const data = (await r.json()) as ProductsResponse;
        if (alive) setSearchResults(data.items || []);
      } catch (e) {
        if (alive) {
          setSearchResults([]);
          setSearchError(e instanceof Error ? e.message : "Не вдалося завантажити товари");
        }
      } finally {
        if (alive) setSearchLoading(false);
      }
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [apiBaseUrl, orderId, showAddForm, search, selectedProduct]);

  const handleSelectProduct = (p: ProductSearchItem) => {
    setSelectedProduct(p);
    setPrice(p.basePrice);
    setSearch(p.sku ? `${p.sku} ${p.name}` : p.name);
    setSearchResults([]);
    setSearchError(null);
    requestAnimationFrame(() => qtyInputRef.current?.focus());
  };

  const addItemToOrder = useCallback(
    async (productId: string, itemQty: number, itemPrice: number) => {
      if (!orderId) return;
      const payload = { productId, qty: itemQty, price: itemPrice };
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) throw new Error(`Не вдалося додати позицію (${r.status})`);
      await Promise.all([refreshOrder(), refreshTimeline()]);
      onSaved?.();
    },
    [apiBaseUrl, orderId, refreshOrder, refreshTimeline, onSaved],
  );

  const handleAddItemSubmit = async () => {
    if (!orderId || !selectedProduct) return;

    if (!Number.isFinite(qty) || qty < 1) {
      setSubmitError(t.qtyMinError);
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      setSubmitError(t.priceMinError);
      return;
    }

    setSubmittingItem(true);
    setSubmitError(null);
    try {
      await addItemToOrder(selectedProduct.id, qty, price);
      // Add & add another: keep form open, reset only product/search, keep qty/price
      setSelectedProduct(null);
      setSearch("");
      setSearchResults([]);
      requestAnimationFrame(() => searchInputRef.current?.focus());
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Не вдалося додати позицію");
    } finally {
      setSubmittingItem(false);
    }
  };

  const handleAddItemQuick = useCallback(
    async (p: ProductSearchItem) => {
      if (!orderId) return;
      setSubmittingItem(true);
      setSubmitError(null);
      try {
        await addItemToOrder(p.id, 1, p.basePrice);
        setSelectedProduct(null);
        setSearch("");
        setSearchResults([]);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      } catch (e) {
        setSubmitError(e instanceof Error ? e.message : "Не вдалося додати позицію");
      } finally {
        setSubmittingItem(false);
      }
    },
    [orderId, addItemToOrder],
  );

  const headerTitle = useMemo(() => {
    if (isCreate) return t.newOrder;
    return order?.orderNumber ?? "…";
  }, [isCreate, order?.orderNumber]);

  const formatDt = (iso: string) => {
    try {
      return formatDateTime(iso);
    } catch {
      return iso;
    }
  };

  const np = (order as { deliveryData?: { novaPoshta?: unknown } })?.deliveryData?.novaPoshta as
    | {
        ttn?: { number?: string };
        status?: { Status?: string; statusText?: string; StatusCode?: string; statusCode?: string };
      }
    | undefined;
  const ttnNumber: string | null =
    np?.ttn?.number ?? (order?.ttns?.length ? order.ttns[0].documentNumber : null) ?? null;
  const ttnStatusText: string | null =
    np?.status?.Status ?? np?.status?.statusText ?? order?.ttns?.[0]?.statusText ?? null;
  const ttnStatusCode: string | null =
    np?.status?.StatusCode ?? np?.status?.statusCode ?? order?.ttns?.[0]?.statusCode ?? null;
  const shipmentRowsAll = (order?.shipments ?? []).map((s) => ({
    shipmentId: s.id,
    shipmentStatus: s.status ?? null,
    ttnId: s.ttns?.[0]?.id ?? null,
    ttnNumber: s.ttns?.[0]?.documentNumber ?? null,
    ttnStatusText: s.ttns?.[0]?.statusText ?? null,
    ttnStatusCode: s.ttns?.[0]?.statusCode ?? null,
  }));
  const formatShipmentStatus = (status: string | null) => {
    if (!status) return "Невідомо";
    if (status === "DRAFT") return "Чернетка відправки";
    if (status === "IN_TRANSIT") return "В дорозі";
    if (status === "DELIVERED") return "Доставлено";
    if (status === "CANCELED") return "Скасовано";
    return status;
  };
  const shipmentRows = shipmentRowsAll.filter(
    (r) => !((r.shipmentStatus ?? "") === "CANCELED" && !r.ttnNumber),
  );
  const canShowCreateTtnButton = useMemo(() => {
    if (
      isCreate ||
      loading ||
      !order ||
      order.deliveryMethod !== "NOVA_POSHTA" ||
      !npModuleEffective
    )
      return false;
    const npLocal = (order as { deliveryData?: { novaPoshta?: { ttn?: { number?: string } } } })
      ?.deliveryData?.novaPoshta;
    const numFromData = npLocal?.ttn?.number;
    const hasTtn =
      !!(numFromData && String(numFromData).trim()) ||
      (order.ttns?.length ?? 0) > 0 ||
      (order.shipments ?? []).some((s) => (s.ttns?.length ?? 0) > 0);
    return !hasTtn;
  }, [isCreate, loading, npModuleEffective, order]);

  const ensureListsForCompanyClient = useCallback(
    async (cid: string | null) => {
      if (companies.length === 0) await fetchCompanies();
      await fetchContacts(cid);
    },
    [companies.length, fetchCompanies, fetchContacts],
  );

  const contactOptions = useMemo(() => {
    const list = contacts.map((c) => ({
      id: c.id,
      label: formatContactOptionLabel(c, {
        hasCompany: !companyId && Boolean(c.companyId),
      }),
    }));
    if (clientId && order?.client && !contacts.some((c) => c.id === clientId)) {
      return [
        {
          id: order.client.id,
          label: formatContactOptionLabel(order.client),
        },
        ...list,
      ];
    }
    return list;
  }, [contacts, clientId, order?.client, companyId]);

  const responsibleOptions = useMemo<Option[]>(
    () =>
      users.map((u) => ({
        id: u.id,
        label: u.fullName || u.email,
      })),
    [users],
  );

  const shouldShowCompanyField = useMemo(() => {
    const selectedContact = clientId ? contacts.find((c) => c.id === clientId) : null;
    return Boolean(selectedContact?.companyId || order?.companyId);
  }, [clientId, contacts, order?.companyId]);

  const deleteOrder = useCallback(async () => {
    if (!orderId || !order) return;
    const ok = await confirm({
      title: "Видалити замовлення",
      message: "Видалити замовлення? Цю дію неможливо скасувати.",
      confirmText: "Видалити",
      destructive: true,
    });
    if (!ok) return;
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch(`${apiBaseUrl}/orders/${orderId}`, {
        method: "DELETE",
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        throw new Error(data?.message ?? `Не вдалося видалити замовлення (${r.status})`);
      }
      onSaved?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося видалити замовлення");
    } finally {
      setDeleting(false);
    }
  }, [apiBaseUrl, orderId, order, confirm, onClose, onSaved]);

  const orderHeaderActions = (
    <>
      {!isCreate && order ? (
        <div ref={returnsDocsMenuRef} className="relative">
          <button
            type="button"
            onClick={() => setReturnsDocsMenuOpen((o) => !o)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-700 shadow-sm hover:bg-zinc-50"
            aria-expanded={returnsDocsMenuOpen}
            aria-haspopup="menu"
            aria-label="Меню: документи, повернення, дії"
            title="Документи та повернення"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
          {returnsDocsMenuOpen ? (
            <div
              className="absolute right-0 top-full z-[100] mt-1 w-[min(100vw-2rem,20rem)] rounded-lg border border-zinc-200 bg-white shadow-lg"
              role="menu"
            >
              <div className="max-h-[min(70vh,28rem)] space-y-4 overflow-auto p-3">
                <div>
                  <div className="mb-1.5 text-xs font-medium text-zinc-600">PDF документи</div>
                  <div className="flex flex-col gap-1.5">
                    <a
                      href={`/api/orders/${order.id}/documents/invoice`}
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      onClick={() => setReturnsDocsMenuOpen(false)}
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                    >
                      Рахунок (PDF)
                    </a>
                    <a
                      href={`/api/orders/${order.id}/documents/waybill`}
                      target="_blank"
                      rel="noopener noreferrer"
                      role="menuitem"
                      onClick={() => setReturnsDocsMenuOpen(false)}
                      className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                    >
                      РН (PDF)
                    </a>
                  </div>
                </div>
                <div className="border-t border-zinc-100 pt-3">
                  <div className="mb-1.5 text-xs font-medium text-zinc-600">Повернення</div>
                  {returnsLoading ? (
                    <div className="text-xs text-zinc-500">Завантаження…</div>
                  ) : orderReturns.length > 0 ? (
                    <ul className="space-y-2 text-sm text-zinc-700">
                      {orderReturns.map((ret) => (
                        <li key={ret.id} className="rounded border border-zinc-200 px-2 py-1.5">
                          <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
                            <span className="min-w-0 flex-1 text-sm">
                              Повернення від {formatDate(ret.requestedAt)} —{" "}
                              {RETURN_STATUS_LABELS[ret.status] ?? ret.status}
                            </span>
                            <button
                              type="button"
                              disabled={
                                !NEXT_RETURN_STATUS[ret.status] || returnStatusUpdatingId === ret.id
                              }
                              onClick={() => {
                                if (!NEXT_RETURN_STATUS[ret.status] || returnStatusUpdatingId === ret.id) return;
                                void advanceReturnStatus(ret.id, ret.status);
                              }}
                              className="shrink-0 rounded border border-zinc-300 bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                            >
                              {returnStatusUpdatingId === ret.id
                                ? "Оновлення…"
                                : "Наступний статус"}
                            </button>
                          </div>
                          {Number(ret.creditAmount ?? 0) > 0 && (
                            <div className="mt-1 text-xs text-zinc-500">
                              Залік: {Number(ret.creditAmount).toFixed(2)}
                            </div>
                          )}
                          {Number(ret.refundAmount ?? 0) > 0 && (
                            <div className="mt-0.5 text-xs text-zinc-500">
                              Повернення коштів: {Number(ret.refundAmount).toFixed(2)}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-xs text-zinc-400">Немає повернень</div>
                  )}
                  {(order.orderStage === "RECEIVED" ||
                    order.orderStage === "COMPLETED" ||
                    order.orderStage === "RETURN_IN_PROGRESS") &&
                    !showCreateReturnForm && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setReturnsDocsMenuOpen(false);
                          setShowCreateReturnForm(true);
                          setReturnItemQtys(
                            Object.fromEntries((order.items ?? []).map((it) => [it.id, 0])),
                          );
                        }}
                        className="mt-2 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                      >
                        Оформити повернення
                      </button>
                    )}
                </div>
                {isAdmin ? (
                  <div className="border-t border-zinc-200 pt-3">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={deleting}
                      onClick={() => {
                        setReturnsDocsMenuOpen(false);
                        void deleteOrder();
                      }}
                      className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-left text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                    >
                      {deleting ? "Видалення…" : "Видалити замовлення"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </>
  );

  const tabsUnderHeader =
    !isCreate && order ? (
      <div className="min-w-0 space-y-2">
        <Stepper
          stage={order.orderStage ?? order.status}
          onStepClick={setOrderStage}
          disabled={statusUpdating}
          hasPayment={Number(order.paidAmount ?? 0) > 0}
          debtAmount={Math.max(0, Number(order.debtAmount ?? 0))}
          completionBlockers={order.completionBlockers ?? []}
          isAdmin={isAdmin}
          isWarehouse={isWarehouse}
          paymentType={order.paymentType ?? paymentType ?? null}
          deliveryMethod={order.deliveryMethod ?? deliveryMethod ?? null}
          hasTtn={orderHasTtn(order)}
        />
        {(order.completionBlockers?.length ?? 0) > 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
            <div className="font-medium">Завершення замовлення заблоковано</div>
            <ul className="mt-1 list-inside list-disc text-xs text-amber-900">
              {(order.completionBlockers ?? []).map((b) => (
                <li key={b}>
                  {b.startsWith("open_debt:")
                    ? `Є борг ${b.slice("open_debt:".length)}`
                    : b.startsWith("financial_status:")
                      ? `Фінансовий статус: ${b.slice("financial_status:".length)} (потрібно CLOSED)`
                      : b.startsWith("unsettled_return:")
                        ? "Є закритe повернення з неоформленою переплатою — проведіть залік або повернення коштів"
                        : b}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {order.parent || (order.children && order.children.length > 0) ? (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            <div className="text-xs font-semibold text-zinc-600">Повʼязані замовлення</div>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {order.parent ? (
                <span>
                  Батьківське:{" "}
                  {onOpenOrder ? (
                    <button
                      type="button"
                      className="font-medium text-sky-700 underline hover:text-sky-900"
                      onClick={() => onOpenOrder(order.parent!.id)}
                    >
                      №{order.parent.orderNumber}
                    </button>
                  ) : (
                    <span className="font-medium">№{order.parent.orderNumber}</span>
                  )}
                </span>
              ) : null}
              {order.children && order.children.length > 0 ? (
                <span className="inline-flex flex-wrap items-center gap-x-1">
                  <span>Дочірні:</span>
                  {order.children.map((ch, i) => (
                    <span key={ch.id}>
                      {i > 0 ? ", " : null}
                      {onOpenOrder ? (
                        <button
                          type="button"
                          className="font-medium text-sky-700 underline hover:text-sky-900"
                          onClick={() => onOpenOrder(ch.id)}
                        >
                          №{ch.orderNumber}
                        </button>
                      ) : (
                        <span className="font-medium">№{ch.orderNumber}</span>
                      )}
                    </span>
                  ))}
                </span>
              ) : null}
            </div>
          </div>
        ) : null}
        <div className="min-w-0 flex flex-wrap gap-1 border-b border-zinc-200 pb-2">
          <button
            type="button"
            onClick={() => setLeftTab("main")}
            className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${leftTab === "main" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            {t.tabMain}
          </button>
          <button
            type="button"
            onClick={() => setLeftTab("items")}
            className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${leftTab === "items" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            {t.tabItems}
            <TabCountBubble count={order.items?.length ?? 0} active={leftTab === "items"} />
          </button>
          <button
            type="button"
            onClick={() => setLeftTab("activity")}
            className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${leftTab === "activity" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            {t.tabActivity}
            <TabCountBubble count={activityTabCount} active={leftTab === "activity"} />
          </button>
          <button
            type="button"
            onClick={() => setLeftTab("change-history")}
            className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${leftTab === "change-history" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            {t.tabHistory}
          </button>
          <button
            type="button"
            onClick={() => setLeftTab("tasks")}
            className={`inline-flex items-center rounded px-2 py-1 text-sm font-medium ${leftTab === "tasks" ? "bg-accent-gradient text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
          >
            {t.tabTasks}
            <TabCountBubble count={tasksTabCount} active={leftTab === "tasks"} />
          </button>
        </div>
      </div>
    ) : null;

  return (
    <>
      <EntityModalShell
        title={
          <span className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-2">
            <span className="min-w-0 truncate">{headerTitle}</span>
            {!isCreate && order?.legacySource === "bitrix" ? (
              <Badge className="shrink-0 border-zinc-300 bg-zinc-100 text-zinc-700">
                {strings.receivables.bitrixLegacyBadge}
              </Badge>
            ) : null}
            {!isCreate && order?.ttnSharedAcrossOrders ? (
              <span
                className="min-w-0 max-w-full shrink-0"
                title={
                  (order.ttnSharedWithOrders?.length ?? 0) > 0
                    ? t.ttnSharedWith(
                        order.ttnSharedWithOrders?.map((linkedOrder) => `№${linkedOrder.orderNumber}`).join(", ") ?? "",
                      )
                    : t.ttnLinkedOther
                }
              >
                <Badge className="max-w-full truncate border-amber-200 bg-amber-50 text-amber-800">
                  {(order.ttnSharedWithOrders?.length ?? 0) > 0
                    ? t.ttnInOrders(
                        order.ttnSharedWithOrders?.map((linkedOrder) => `№${linkedOrder.orderNumber}`).join(", ") ?? "",
                      )
                    : t.ttnMultiOrders}
                </Badge>
              </span>
            ) : null}
          </span>
        }
        subtitle={!isCreate && order ? formatDt(order.createdAt) : undefined}
        headerActions={orderHeaderActions}
        tabsUnderHeader={tabsUnderHeader}
        onEscape={handleEscape}
        zIndex={zIndex}
        left={
          isCreate ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-zinc-600 mb-1">{t.client}</label>
                  <SearchableSelectLite
                    options={contactOptions}
                    value={clientId}
                    onChange={(id) => {
                      setClientId(id);
                      if (id) {
                        const c = contacts.find((x) => x.id === id);
                        if (c?.companyId) setCompanyId(c.companyId);
                      }
                    }}
                    disabled={loadingContacts}
                    isLoading={loadingContacts}
                    placeholder={t.selectClient}
                    onCreate={onOpenContact ? () => onOpenContact("new") : undefined}
                    createLabel={t.createContact}
                    onSearchQueryChange={onContactSearchQueryChange}
                    searchPlaceholder={t.searchClientBy1C}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600 mb-1">{t.company}</label>
                  <SearchableSelectLite
                    options={companies.map((c) => ({ id: c.id, label: c.name }))}
                    value={companyId}
                    onChange={(id) => {
                      setCompanyId(id);
                      setClientId(null);
                      void fetchContacts(id);
                    }}
                    disabled={loadingCompanies}
                    isLoading={loadingCompanies}
                    placeholder={t.selectCompany}
                    onCreate={onOpenCompany ? () => onOpenCompany("new") : undefined}
                    createLabel={t.createCompany}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600">{t.delivery}</label>
                  <div className="mt-1 inline-flex w-full rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 shadow-inner">
                    <button
                      type="button"
                      aria-pressed={deliveryMethod === "PICKUP"}
                      onClick={() => setDeliveryMethod("PICKUP")}
                      className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition ${
                        deliveryMethod === "PICKUP"
                          ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                          : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                      }`}
                    >
                      {t.pickup}
                    </button>
                    <button
                      type="button"
                      aria-pressed={deliveryMethod === "NOVA_POSHTA"}
                      onClick={() => {
                        if (!npModuleEffective) return;
                        setDeliveryMethod("NOVA_POSHTA");
                      }}
                      disabled={!npModuleEffective}
                      className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition ${
                        deliveryMethod === "NOVA_POSHTA"
                          ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                          : npModuleEffective
                            ? "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                            : "cursor-not-allowed text-zinc-400"
                      }`}
                    >
                      {t.novaPoshta}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-600">{t.discount}</label>
                  <input
                    type="number"
                    min={0}
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Math.max(0, Number(e.target.value)))}
                    className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="mt-4">
                <label className="block text-xs font-medium text-zinc-600">{t.comment}</label>
                <textarea
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-white disabled:opacity-50"
                >
                  {t.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void createOrder()}
                  disabled={saving}
                  className="btn-primary"
                >
                  {saving ? t.saving : t.create}
                </button>
              </div>
            </div>
          ) : loading ? (
            <p className="text-sm text-zinc-500">{t.loading}</p>
          ) : error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : !order ? (
            <p className="text-sm text-zinc-500">{t.notFound}</p>
          ) : leftTab === "change-history" ? (
            <EntitySection title={t.tabHistory}>
              <EntityChangeHistoryPanel entityType="Order" entityId={orderId!} />
            </EntitySection>
          ) : leftTab === "activity" ? (
            <EntitySection title={t.tabActivity}>
              <OrderTimeline orderId={orderId!} onItemsCountChange={setActivityTabCount} />
            </EntitySection>
          ) : leftTab === "tasks" ? (
            <EntitySection title={t.tabTasks}>
              <EntityTasksList orderId={orderId!} onCountChange={setTasksTabCount} />
            </EntitySection>
          ) : leftTab === "items" ? (
            <div ref={itemsCardRef}>
              <EntitySection
                title={t.itemsTitle}
                rightAction={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {canEditLineDiscounts ? (
                      <button
                        type="button"
                        onClick={() => setShowDiscounts((v) => !v)}
                        aria-pressed={showDiscounts}
                        className={`rounded-md border px-2 py-1 text-xs font-medium ${
                          showDiscounts
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 text-zinc-700 hover:bg-zinc-50"
                        }`}
                      >
                        {t.discounts}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setShowAddForm((v) => !v)}
                      className="rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                    >
                      {showAddForm ? t.done : t.addItem}
                    </button>
                  </div>
                }
              >
                <div className="mb-4 max-w-md">
                  <div className="text-xs text-zinc-500">{t.shipmentWarehouse}</div>
                  {editing === "warehouse" ? (
                    <div className="mt-1">
                      <select
                        value={warehouseId ?? ""}
                        onChange={async (e) => {
                          const v = e.target.value || null;
                          setWarehouseId(v);
                          try {
                            await patchOrder({ warehouseId: v });
                            if (order) {
                              setOrder((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      warehouseId: v,
                                      warehouse: v
                                        ? warehouses.find((w) => w.id === v)
                                          ? {
                                              id: v,
                                              name: warehouses.find((w) => w.id === v)!.name,
                                            }
                                          : prev.warehouse
                                        : null,
                                    }
                                  : prev,
                              );
                            }
                          } finally {
                            setEditing(null);
                          }
                        }}
                        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                        disabled={saving}
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setWarehouseId(order.warehouseId ?? null);
                        setEditing("warehouse");
                      }}
                      className="mt-1 font-medium text-zinc-900 hover:underline"
                    >
                      {order.warehouse?.name ??
                        (warehouseId
                          ? warehouses.find((w) => w.id === warehouseId)?.name
                          : null) ?? (
                          <span className="font-normal text-zinc-400">{t.selectWarehouse}</span>
                        )}
                    </button>
                  )}
                </div>
                {canSplitByStock ? (
                  <div className="mb-4">
                    <button
                      type="button"
                      disabled={splittingByStock || saving || statusUpdating}
                      onClick={() => void splitOrderByStock()}
                      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                    >
                      {splittingByStock ? t.splitting : t.splitByStock}
                    </button>
                    <p className="mt-1 text-xs text-zinc-500">{t.splitHint}</p>
                  </div>
                ) : null}
                {showAddForm ? (
                  <div
                    className={cx(
                      "mb-3 flex min-w-0 gap-2",
                      isNarrowViewport ? "flex-col" : "flex-wrap items-end",
                    )}>
                    <div
                      ref={searchWrapRef}
                      className={cx(
                        "relative",
                        isNarrowViewport ? "w-full" : "min-w-[8rem] flex-[1_1_12rem]",
                      )}>
                      <input
                        ref={searchInputRef}
                        value={search}
                        onChange={(e) => {
                          setSearch(e.target.value);
                          setSelectedProduct(null);
                        }}
                        placeholder={t.productPlaceholder}
                        className="w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm"
                      />
                      {!selectedProduct && searchResults.length > 0 ? (
                        <FixedDropdownPortal
                          open
                          anchorRef={searchWrapRef}
                          maxHeight="9rem"
                          minWidth={280}
                        >
                          {searchResults.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => handleSelectProduct(p)}
                              onDoubleClick={(e) => {
                                e.preventDefault();
                                void handleAddItemQuick(p);
                              }}
                              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left text-sm hover:bg-zinc-50"
                            >
                              <span className="min-w-0 flex-1 truncate font-medium text-zinc-900">
                                {p.sku ? `${p.sku} ${p.name}` : p.name}
                              </span>
                              <span className="shrink-0 text-xs text-zinc-500">
                                {(stockAtWarehouse(p, order?.warehouseId) ?? p.stock) !== undefined
                                  ? t.stockLeft(stockAtWarehouse(p, order?.warehouseId) ?? p.stock ?? 0)
                                  : ""}
                              </span>
                            </button>
                          ))}
                        </FixedDropdownPortal>
                      ) : null}
                      {searchLoading ? (
                        <div className="mt-0.5 text-[10px] text-zinc-500">Пошук…</div>
                      ) : null}
                      {searchError ? (
                        <div className="mt-0.5 text-[10px] text-red-600">{searchError}</div>
                      ) : null}
                      {selectedProduct ? (
                        <div className="min-w-0 w-full truncate text-[10px] text-zinc-600">
                          {selectedProduct.sku
                            ? `${selectedProduct.sku} ${selectedProduct.name}`
                            : selectedProduct.name}
                          {(stockAtWarehouse(selectedProduct, order?.warehouseId) ??
                            selectedProduct.stock) !== undefined ? (
                            <span className="ml-1 text-zinc-500">
                              {t.stockLeft(
                                stockAtWarehouse(selectedProduct, order?.warehouseId) ??
                                  selectedProduct.stock ??
                                  0,
                              )}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {submitError && isNarrowViewport ? (
                        <span className="mt-0.5 block text-[10px] text-red-600">{submitError}</span>
                      ) : null}
                    </div>
                    <div
                      className={cx(
                        isNarrowViewport ? "flex flex-wrap items-end gap-2" : "contents",
                      )}>
                      <div
                        ref={qtyControlsWrapRef}
                        className="flex h-[34px] shrink-0 items-stretch overflow-hidden rounded-md border border-zinc-300 bg-white"
                      >
                      <input
                        ref={qtyInputRef}
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={qty}
                        onChange={(e) => {
                          const onlyDigits = e.target.value.replace(/\D/g, "").slice(0, 3);
                          setQty(Math.min(999, Math.max(1, Number(onlyDigits) || 1)));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void handleAddItemSubmit();
                          }
                        }}
                        maxLength={3}
                        className="w-10 border-0 px-1 py-1.5 text-right text-sm focus:outline-none"
                        placeholder={t.qtyPlaceholder}
                      />
                      <div className="flex w-6 flex-col border-l border-zinc-300">
                        <button
                          ref={qtyIncBtnRef}
                          type="button"
                          onClick={() => setQty((v) => Math.min(999, v + 1))}
                          aria-label={t.incQty}
                          className="flex flex-1 items-center justify-center border-b border-zinc-300 text-[10px] leading-none text-zinc-600 hover:bg-zinc-50"
                        >
                          +
                        </button>
                        <button
                          ref={qtyDecBtnRef}
                          type="button"
                          onClick={() => setQty((v) => Math.max(1, v - 1))}
                          aria-label={t.decQty}
                          className="flex flex-1 items-center justify-center text-[10px] leading-none text-zinc-600 hover:bg-zinc-50"
                        >
                          −
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      ref={priceInputRef}
                      value={price}
                      onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void handleAddItemSubmit();
                        }
                      }}
                      disabled={!isAdmin}
                      className={`w-14 rounded-md border px-1.5 py-1.5 text-right text-sm ${
                        isAdmin
                          ? "border-zinc-300"
                          : "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-500"
                      }`}
                      placeholder={t.pricePlaceholder}
                    />
                    <button
                      type="button"
                      disabled={!selectedProduct || submittingItem}
                      onClick={() => void handleAddItemSubmit()}
                      className="rounded-md bg-zinc-900 px-2 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
                    >
                      {submittingItem ? "…" : t.add}
                    </button>
                    {submitError && !isNarrowViewport ? (
                      <span className="w-full text-[10px] text-red-600 sm:w-auto">
                        {submitError}
                      </span>
                    ) : null}
                    </div>
                  </div>
                ) : null}
                <ul className="divide-y divide-zinc-100 text-sm">
                  {order.items.length === 0 ? (
                    <li className="py-2 text-zinc-500">{t.noItems}</li>
                  ) : (
                    order.items.map((it) => (
                      <li
                        key={it.id}
                        className="flex flex-wrap items-start justify-between gap-x-2 gap-y-2 py-1.5 sm:items-center"
                      >
                        <div className="min-w-0 flex-1 basis-[min(100%,12rem)]">
                          {it.product?.sku ? (
                            <div className="truncate text-[11px] text-zinc-500">{it.product.sku}</div>
                          ) : null}
                          <span className="block truncate text-xs font-medium text-zinc-700">
                            {it.product?.name || it.productName || it.productId}
                          </span>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                          {editingItem?.itemId === it.id && editingItem?.field === "qty" ? (
                            <div className="flex flex-col items-center gap-0.5">
                              <button
                                type="button"
                                onClick={() => {
                                  const cur = Math.max(1, Number(editingItem.value) || 1);
                                  const next = cur + 1;
                                  setEditingItem((prev) =>
                                    prev ? { ...prev, value: String(next) } : null,
                                  );
                                  void patchOrderItem(it.id, { qty: next });
                                }}
                                aria-label={t.incQty}
                                className="flex h-8 w-9 shrink-0 items-center justify-center rounded border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50"
                              >
                                +
                              </button>
                              <input
                                type="number"
                                min={1}
                                value={editingItem.value}
                                onChange={(e) =>
                                  setEditingItem((prev) =>
                                    prev ? { ...prev, value: e.target.value } : null,
                                  )
                                }
                                onBlur={async (e) => {
                                  const val = Math.max(
                                    1,
                                    Number((e.target as HTMLInputElement).value) || 1,
                                  );
                                  await patchOrderItem(it.id, { qty: val });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const val = Math.max(
                                      1,
                                      Number((e.target as HTMLInputElement).value) || 1,
                                    );
                                    void patchOrderItem(it.id, { qty: val });
                                  }
                                  if (e.key === "Escape") setEditingItem(null);
                                }}
                                autoFocus
                                className={`${isWarehouse ? "w-20" : "w-12"} rounded border border-zinc-300 px-1 py-0.5 text-right text-sm`}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const cur = Math.max(1, Number(editingItem.value) || 1);
                                  const next = Math.max(1, cur - 1);
                                  setEditingItem((prev) =>
                                    prev ? { ...prev, value: String(next) } : null,
                                  );
                                  void patchOrderItem(it.id, { qty: next });
                                }}
                                aria-label={t.decQty}
                                className="flex h-8 w-9 shrink-0 items-center justify-center rounded border border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50 disabled:opacity-50"
                              >
                                −
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingItem({
                                  itemId: it.id,
                                  field: "qty",
                                  value: String(it.qty),
                                })
                              }
                              className="text-zinc-600 hover:underline"
                            >
                              {it.qty}
                            </button>
                          )}
                          <span className="text-zinc-400">×</span>
                          {editingItem?.itemId === it.id && editingItem?.field === "price" ? (
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={editingItem.value}
                              onChange={(e) =>
                                setEditingItem((prev) =>
                                  prev ? { ...prev, value: e.target.value } : null,
                                )
                              }
                              onBlur={async (e) => {
                                const val = Math.max(
                                  0,
                                  Number((e.target as HTMLInputElement).value) || 0,
                                );
                                await patchOrderItem(it.id, { price: val });
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const val = Math.max(
                                    0,
                                    Number((e.target as HTMLInputElement).value) || 0,
                                  );
                                  void patchOrderItem(it.id, { price: val });
                                }
                                if (e.key === "Escape") setEditingItem(null);
                              }}
                              autoFocus
                              className="w-14 rounded border border-zinc-300 px-1 py-0.5 text-right text-sm"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setEditingItem({
                                  itemId: it.id,
                                  field: "price",
                                  value: String(it.price),
                                })
                              }
                              className="text-zinc-600 hover:underline"
                            >
                              {it.price.toFixed(2)}
                              {isForeignOrderCurrency(order.currency) &&
                              order.exchangeRate != null &&
                              order.exchangeRate > 0 ? (
                                <span className="ml-1 text-zinc-500 font-normal">
                                  ({Math.round(it.price * order.exchangeRate)} ₴)
                                </span>
                              ) : null}
                            </button>
                          )}
                          {showDiscounts && canEditLineDiscounts ? (
                            <select
                              value={it.discountPercent ?? 0}
                              disabled={saving}
                              onChange={(e) =>
                                void patchOrderItem(it.id, {
                                  discountPercent: Number(e.target.value),
                                })
                              }
                              className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs text-zinc-700"
                              aria-label={t.lineDiscountAria}
                            >
                              <option value={0}>—</option>
                              {discountOptions.map((p) => (
                                <option key={p} value={p}>
                                  −{p}%
                                </option>
                              ))}
                            </select>
                          ) : null}
                          <span className="text-zinc-500">=</span>
                          <span className="w-14 text-right font-medium text-zinc-900">
                            {it.lineTotal.toFixed(2)}
                            {(it.discountPercent ?? 0) > 0 ? (
                              <span className="ml-1 text-[10px] font-normal text-zinc-400 line-through">
                                {(it.qty * it.price).toFixed(2)}
                              </span>
                            ) : null}
                            {isForeignOrderCurrency(order.currency) &&
                            order.exchangeRate != null &&
                            order.exchangeRate > 0 ? (
                              <span className="ml-1 text-zinc-500 font-normal">
                                ({Math.round(it.lineTotal * order.exchangeRate)} ₴)
                              </span>
                            ) : null}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => void deleteOrderItem(it.id)}
                          disabled={saving || !npModuleEffective}
                          className="rounded p-1 text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          title={t.deleteItem}
                          aria-label={t.deleteItem}
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </EntitySection>
            </div>
          ) : (
            <>
              <EntitySection title={t.aboutOrder}>
                <div className="overflow-hidden rounded-md border border-zinc-200 bg-white p-4">
                  <div className="grid grid-cols-1 gap-4 text-sm xl:grid-cols-2 xl:gap-4 [&>*]:min-w-0">
                    <div className="min-w-0 xl:col-span-2">
                      <div className="text-xs text-zinc-500">{t.client}</div>
                      {editing === "client" ? (
                        <div className="mt-1">
                          <SearchableSelectLite
                            value={clientId}
                            options={contactOptions}
                            placeholder={t.selectClient}
                            disabled={saving}
                            isLoading={loadingContacts}
                            onSearchQueryChange={onContactSearchQueryChange}
                    searchPlaceholder={t.searchClientBy1C}
                            onChange={async (id) => {
                              setClientId(id);
                              let nextCompanyId = companyId;
                              const selectedContact = id ? contacts.find((x) => x.id === id) : null;
                              if (selectedContact?.companyId) {
                                nextCompanyId = selectedContact.companyId;
                                setCompanyId(selectedContact.companyId);
                              }
                              try {
                                await patchOrder({
                                  clientId: id,
                                  contactId: id,
                                  companyId: nextCompanyId,
                                });
                                // Optimistically update order.client so the button shows the selected client
                                if (order && id && selectedContact) {
                                  setOrder((prev) =>
                                    prev
                                      ? {
                                          ...prev,
                                          clientId: id,
                                          client: {
                                            id: selectedContact.id,
                                            firstName: selectedContact.firstName,
                                            lastName: selectedContact.lastName,
                                            phone: selectedContact.phone,
                                          },
                                        }
                                      : prev,
                                  );
                                }
                              } finally {
                                setEditing(null);
                              }
                            }}
                            onCreate={onOpenContact ? () => onOpenContact("new") : undefined}
                            createLabel={t.createContact}
                          />
                          <div className="mt-1 text-xs text-zinc-500">{t.escCancel}</div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            setEditing("client");
                            await ensureListsForCompanyClient(companyId);
                          }}
                          className="mt-1 min-h-9 w-full max-w-full truncate rounded-md px-2 py-1.5 text-left text-zinc-900 hover:bg-zinc-50"
                        >
                          {order.client ? (
                            <span className="block truncate">
                              {`${order.client.lastName} ${order.client.firstName} — ${order.client.phone}`}
                            </span>
                          ) : (
                            <span className="font-normal text-zinc-400">{t.selectClientHint}</span>
                          )}
                        </button>
                      )}
                    </div>

                    {isWarehouse ? (
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-500">Код 1С</div>
                        <div className="mt-1 min-h-9 font-medium text-zinc-900">
                          {orderClientExternalCode(order) ?? "—"}
                        </div>
                      </div>
                    ) : null}

                    <div className="min-w-0">
                      <div className="text-xs text-zinc-500">{t.orderSource}</div>
                      <div className="mt-1 min-h-9 break-all leading-6 text-zinc-700">
                        {order.orderSource === "STORE"
                          ? t.sourceStore
                          : order.orderSource === "CRM"
                            ? t.sourceCrm
                            : (order.orderSource ?? "—")}
                      </div>
                    </div>

                    {shouldShowCompanyField ? (
                      <div className="min-w-0">
                        <div className="text-xs text-zinc-500">{t.company}</div>
                        {editing === "company" ? (
                          <div className="mt-1">
                            <SearchableSelectLite
                              value={companyId}
                              options={companies.map((c) => ({ id: c.id, label: c.name }))}
                              placeholder={t.selectCompany}
                              disabled={saving}
                              isLoading={loadingCompanies}
                              onChange={async (id) => {
                                setCompanyId(id);
                                setClientId(null);
                                const selectedCompany = id
                                  ? companies.find((c) => c.id === id)
                                  : null;
                                try {
                                  await patchOrder({
                                    companyId: id,
                                    clientId: null,
                                    contactId: null,
                                  });
                                  if (order && id && selectedCompany) {
                                    setOrder((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            companyId: id,
                                            company: {
                                              id: selectedCompany.id,
                                              name: selectedCompany.name,
                                            },
                                          }
                                        : prev,
                                    );
                                  }
                                  await fetchContacts(id);
                                } finally {
                                  setEditing(null);
                                }
                              }}
                              onCreate={onOpenCompany ? () => onOpenCompany("new") : undefined}
                              createLabel={t.createCompany}
                            />
                            <div className="mt-1 text-xs text-zinc-500">{t.escCancel}</div>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={async () => {
                              setEditing("company");
                              await ensureListsForCompanyClient(companyId);
                            }}
                            className="mt-1 min-h-9 w-full max-w-full truncate rounded-md px-2 py-1.5 text-left text-zinc-900 hover:bg-zinc-50"
                          >
                            {order.company ? (
                              <span className="block truncate">{order.company.name}</span>
                            ) : (
                              <span className="font-normal text-zinc-400">{t.selectCompanyHint}</span>
                            )}
                          </button>
                        )}
                      </div>
                    ) : null}

                    <div className="min-w-0 xl:col-span-2 xl:justify-self-end xl:pl-4 xl:text-right">
                      {(orderLineDiscountSum > 0 || Number(order.discountAmount ?? 0) > 0) && (
                        <div className="mb-2 space-y-0.5 text-xs tabular-nums text-zinc-500">
                          {orderLineDiscountSum > 0 ? (
                            <>
                              <div>
                                {t.baseAmount} {orderGrossSubtotal.toFixed(2)}{" "}
                                {orderCurrencySymbol(order.currency)}
                              </div>
                              <div>
                                {t.lineDiscount} −{orderLineDiscountSum.toFixed(2)}{" "}
                                {orderCurrencySymbol(order.currency)}
                              </div>
                            </>
                          ) : null}
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className="shrink-0">{t.orderDiscount}</span>
                            {editing === "discount" ? (
                              <input
                                type="number"
                                min={0}
                                step={0.01}
                                value={discountAmount}
                                autoFocus
                                onChange={(e) =>
                                  setDiscountAmount(Math.max(0, Number(e.target.value) || 0))
                                }
                                onBlur={() => {
                                  void patchOrder({ discountAmount: Number(discountAmount) || 0 });
                                  setEditing(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    void patchOrder({
                                      discountAmount: Number(discountAmount) || 0,
                                    });
                                    setEditing(null);
                                  }
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                className="w-20 rounded border border-zinc-300 px-1 py-0.5 text-right text-xs"
                              />
                            ) : (
                              <button
                                type="button"
                                onClick={() => setEditing("discount")}
                                className="text-zinc-700 hover:underline"
                              >
                                −{Number(order.discountAmount ?? 0).toFixed(2)}{" "}
                                {orderCurrencySymbol(order.currency)}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                      {orderLineDiscountSum <= 0 && Number(order.discountAmount ?? 0) <= 0 ? (
                        <div className="mb-1 flex flex-wrap items-center justify-end gap-2 text-xs text-zinc-500">
                          <span className="shrink-0">{t.orderDiscount}</span>
                          {editing === "discount" ? (
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              value={discountAmount}
                              autoFocus
                              onChange={(e) =>
                                setDiscountAmount(Math.max(0, Number(e.target.value) || 0))
                              }
                              onBlur={() => {
                                void patchOrder({ discountAmount: Number(discountAmount) || 0 });
                                setEditing(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void patchOrder({ discountAmount: Number(discountAmount) || 0 });
                                  setEditing(null);
                                }
                                if (e.key === "Escape") setEditing(null);
                              }}
                              className="w-20 rounded border border-zinc-300 px-1 py-0.5 text-right text-xs"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setEditing("discount")}
                              className="text-zinc-600 hover:underline"
                            >
                              {t.addDiscount}
                            </button>
                          )}
                        </div>
                      ) : null}
                      <div className="text-xs text-zinc-500">{t.total}</div>
                      {(() => {
                        const grossTotal = Number(order.totalAmount ?? 0);
                        const returnAdj = Number(order.returnAdjustmentAmount ?? 0);
                        const effectiveTotal = Math.max(0, grossTotal - returnAdj);
                        return isForeignOrderCurrency(order.currency) ? (
                          <div className="mt-1">
                            <div className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">
                              {effectiveTotal.toFixed(2)} {orderCurrencySymbol(order.currency)}
                            </div>
                            {returnAdj > 0 ? (
                              <div className="mt-0.5 text-xs tabular-nums text-zinc-500 line-through">
                                {grossTotal.toFixed(2)} {orderCurrencySymbol(order.currency)}
                              </div>
                            ) : null}
                            {order.exchangeRate != null && Number(order.exchangeRate) > 0 ? (
                              <div className="mt-1 text-sm tabular-nums text-zinc-500">
                                {Math.round(effectiveTotal * Number(order.exchangeRate))} ₴
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="mt-1">
                            <div className="font-semibold text-zinc-900">
                              {formatOrderAmount(effectiveTotal, order.currency, order.exchangeRate)}
                            </div>
                            {returnAdj > 0 ? (
                              <div className="mt-0.5 text-xs text-zinc-500 line-through">
                                {formatOrderAmount(grossTotal, order.currency, order.exchangeRate)}
                              </div>
                            ) : null}
                          </div>
                        );
                      })()}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs text-zinc-500">{t.paidDebt}</div>
                      <div className="mt-1 min-h-9 break-all leading-6 text-zinc-700">
                        {formatOrderAmount(
                          Number(order.paidAmount ?? 0),
                          order.currency ?? "UAH",
                          order.exchangeRate,
                        )}{" "}
                        /{" "}
                        {formatOrderAmount(
                          Number(order.debtAmount ?? 0),
                          order.currency ?? "UAH",
                          order.exchangeRate,
                        )}
                      </div>
                      {Number(order.returnAdjustmentAmount ?? 0) > 0 && (
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {t.returnAdjustment} −
                          {Number(order.returnAdjustmentAmount).toFixed(2)}
                        </div>
                      )}
                      {order.isFxVarianceCandidate && order.fxVariance && (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-amber-800">
                          <span>
                            {t.fxVariance}{" "}
                            {formatOrderAmount(
                              order.fxVariance.suggestedWriteOffUsd,
                              order.currency ?? "USD",
                              order.exchangeRate,
                            )}{" "}
                            ({Math.round(order.fxVariance.residualUah)} ₴)
                          </span>
                          <button
                            type="button"
                            onClick={() => setShowFxWriteOff(true)}
                            className="rounded border border-amber-300 bg-amber-50 px-2 py-0.5 font-medium hover:bg-amber-100"
                          >
                            {t.writeOff}
                          </button>
                        </div>
                      )}
                      {Number(order.fxWriteOffAmount ?? 0) > 0 && (
                        <div className="mt-0.5 text-xs text-zinc-500">
                          {t.fxWrittenOff}{" "}
                          {formatOrderAmount(
                            Number(order.fxWriteOffAmount),
                            order.currency ?? "USD",
                            order.exchangeRate,
                          )}
                        </div>
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs text-zinc-500">
                        {t.paymentTerms}{" "}
                        <span className="text-red-600" title={t.requiredField}>
                          *
                        </span>
                      </div>
                      <div
                        className={`mt-1 flex w-full max-w-full rounded-lg border bg-zinc-100 p-0.5 shadow-inner ${
                          !(order.paymentType ?? paymentType)
                            ? "border-red-300 ring-2 ring-red-100"
                            : "border-zinc-200"
                        }`}
                        role="group"
                        aria-label={`${t.paymentTerms}, ${t.requiredField}`}
                      >
                        <button
                          type="button"
                          disabled={saving}
                          aria-pressed={(order.paymentType ?? paymentType) === "PREPAYMENT"}
                          onClick={async () => {
                            const v = "PREPAYMENT";
                            setPaymentType(v);
                            await patchOrder({ paymentType: v });
                            if (order)
                              setOrder((prev) => (prev ? { ...prev, paymentType: v } : prev));
                          }}
                          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition sm:px-3 ${
                            (order.paymentType ?? paymentType) === "PREPAYMENT"
                              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                              : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                          }`}
                        >
                          {t.prepayment}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          aria-pressed={(order.paymentType ?? paymentType) === "DEFERRED"}
                          onClick={async () => {
                            const v = "DEFERRED";
                            const nextDueDate =
                              paymentDueDate.trim() ||
                              (order?.paymentDueDate
                                ? String(order.paymentDueDate).slice(0, 10)
                                : "") ||
                              deferredDueDateFrom(order?.createdAt ?? null);
                            setPaymentType(v);
                            setPaymentDueDate(nextDueDate);
                            await patchOrder({ paymentType: v, paymentDueDate: nextDueDate });
                            if (order) {
                              setOrder((prev) =>
                                prev
                                  ? { ...prev, paymentType: v, paymentDueDate: nextDueDate }
                                  : prev,
                              );
                            }
                          }}
                          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition sm:px-3 ${
                            (order.paymentType ?? paymentType) === "DEFERRED"
                              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                              : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                          }`}
                        >
                          {t.deferred}
                        </button>
                      </div>
                    </div>

                    {(order.paymentType ?? paymentType) === "DEFERRED" ? (
                      <div>
                        <div className="text-xs text-zinc-500">{t.paymentDueDate}</div>
                        {editing === "paymentDueDate" ? (
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <input
                              type="date"
                              value={paymentDueDate}
                              onChange={(e) => setPaymentDueDate(e.target.value)}
                              className="rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                              disabled={saving}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                const v = paymentDueDate.trim() ? paymentDueDate.trim() : null;
                                try {
                                  await patchOrder({ paymentDueDate: v });
                                  if (order) {
                                    setOrder((prev) =>
                                      prev ? { ...prev, paymentDueDate: v ?? undefined } : prev,
                                    );
                                  }
                                } finally {
                                  setEditing(null);
                                }
                              }}
                              className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50"
                            >
                              {strings.common.save}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentDueDate(
                                  order.paymentDueDate
                                    ? (typeof order.paymentDueDate === "string"
                                        ? order.paymentDueDate
                                        : new Date(order.paymentDueDate).toISOString()
                                      ).slice(0, 10)
                                    : "",
                                );
                                setEditing(null);
                              }}
                              className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-50"
                            >
                              {strings.common.cancel}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentDueDate(
                                order.paymentDueDate
                                  ? (typeof order.paymentDueDate === "string"
                                      ? order.paymentDueDate
                                      : new Date(order.paymentDueDate).toISOString()
                                    ).slice(0, 10)
                                  : deferredDueDateFrom(order.createdAt),
                              );
                              setEditing("paymentDueDate");
                            }}
                            className="mt-1 min-h-9 rounded-md px-2 py-1.5 text-left text-zinc-900 hover:bg-zinc-50"
                          >
                            {order.paymentDueDate
                              ? formatDate(order.paymentDueDate)
                              : formatDate(deferredDueDateFrom(order.createdAt))}
                          </button>
                        )}
                      </div>
                    ) : null}

                    <div className="min-w-0">
                      <div className="text-xs text-zinc-500">{t.paymentMethod}</div>
                      <div className="mt-1 flex w-full max-w-full rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 shadow-inner">
                        <button
                          type="button"
                          disabled={saving}
                          aria-pressed={(order.paymentMethod ?? paymentMethod ?? "FOP") === "CASH"}
                          onClick={async () => {
                            const v = "CASH";
                            setPaymentMethod(v);
                            await patchOrder({ paymentMethod: v, bankAccountId: null });
                            if (order) {
                              setOrder((prev) =>
                                prev
                                  ? {
                                      ...prev,
                                      paymentMethod: v,
                                      bankAccountId: null,
                                      bankAccount: null,
                                    }
                                  : prev,
                              );
                            }
                            setBankAccountId(null);
                          }}
                          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition sm:px-3 ${
                            (order.paymentMethod ?? paymentMethod ?? "FOP") === "CASH"
                              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                              : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                          }`}
                        >
                          {t.cash}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          aria-pressed={(order.paymentMethod ?? paymentMethod ?? "FOP") === "FOP"}
                          onClick={async () => {
                            const v = "FOP";
                            setPaymentMethod(v);
                            await patchOrder({ paymentMethod: v });
                            if (order) {
                              setOrder((prev) => (prev ? { ...prev, paymentMethod: v } : prev));
                            }
                          }}
                          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition sm:px-3 ${
                            (order.paymentMethod ?? paymentMethod ?? "FOP") === "FOP"
                              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                              : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                          }`}
                        >
                          {t.nonCash}
                        </button>
                      </div>
                    </div>

                    {(order.paymentMethod ?? paymentMethod ?? "FOP") === "FOP" ? (
                      <div>
                        <div className="text-xs text-zinc-500">{t.fopBank}</div>
                        {editing === "bankAccount" ? (
                          <div className="mt-1">
                            <select
                              value={bankAccountId ?? ""}
                              onChange={async (e) => {
                                const v = e.target.value || null;
                                setBankAccountId(v);
                                try {
                                  await patchOrder({ bankAccountId: v });
                                  if (order)
                                    setOrder((prev) =>
                                      prev
                                        ? {
                                            ...prev,
                                            bankAccountId: v,
                                            bankAccount: v
                                              ? fopAccounts.find((a) => a.id === v)
                                                ? {
                                                    id: v,
                                                    name: fopAccounts.find((a) => a.id === v)!.name,
                                                  }
                                                : prev.bankAccount
                                              : null,
                                          }
                                        : prev,
                                    );
                                } finally {
                                  setEditing(null);
                                }
                              }}
                              className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                              disabled={saving}
                            >
                              <option value="">{t.selectAccount}</option>
                              {fopAccounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setBankAccountId(order.bankAccountId ?? null);
                              setEditing("bankAccount");
                            }}
                            className="mt-1 min-h-9 rounded-md px-2 py-1.5 text-left text-zinc-900 hover:bg-zinc-50"
                          >
                            {order.bankAccount?.name ??
                              (bankAccountId
                                ? fopAccounts.find((a) => a.id === bankAccountId)?.name
                                : null) ?? (
                                <span className="font-normal text-zinc-400">{t.selectFop}</span>
                              )}
                          </button>
                        )}
                      </div>
                    ) : null}

                    <div className="min-w-0">
                      <div className="text-xs text-zinc-500">{t.documents}</div>
                      <div className="mt-1 flex w-full max-w-full rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 shadow-inner">
                        <button
                          type="button"
                          disabled={saving}
                          aria-pressed={!(order.documentsRequested ?? documentsRequested ?? false)}
                          onClick={async () => {
                            const v = false;
                            setDocumentsRequested(v);
                            await patchOrder({ documentsRequested: v });
                            if (order)
                              setOrder((prev) =>
                                prev ? { ...prev, documentsRequested: v } : prev,
                              );
                          }}
                          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition sm:px-3 ${
                            !(order.documentsRequested ?? documentsRequested ?? false)
                              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                              : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                          }`}
                        >
                          {t.no}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          aria-pressed={
                            (order.documentsRequested ?? documentsRequested ?? false) === true
                          }
                          onClick={async () => {
                            const v = true;
                            setDocumentsRequested(v);
                            await patchOrder({ documentsRequested: v });
                            if (order)
                              setOrder((prev) =>
                                prev ? { ...prev, documentsRequested: v } : prev,
                              );
                          }}
                          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition sm:px-3 ${
                            (order.documentsRequested ?? documentsRequested ?? false) === true
                              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                              : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                          }`}
                        >
                          {t.yes}
                        </button>
                      </div>
                    </div>

                    {(order.invoiceNumber ??
                      order.invoiceDate ??
                      order.waybillNumber ??
                      order.waybillDate) && (
                      <div>
                        <div className="text-xs text-zinc-500">{t.documents1c}</div>
                        <div className="mt-1 space-y-0.5 text-sm text-zinc-700">
                          {order.invoiceNumber && (
                            <div>
                              {t.invoice} {order.invoiceNumber}
                              {order.invoiceDate ? ` від ${order.invoiceDate}` : ""}
                            </div>
                          )}
                          {order.waybillNumber && (
                            <div>
                              {t.waybill} {order.waybillNumber}
                              {order.waybillDate ? ` від ${order.waybillDate}` : ""}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {showCreateReturnForm && order.items && order.items.length > 0 ? (
                      <div className="col-span-1 xl:col-span-2">
                        <div className="text-xs font-medium text-zinc-600">
                          {t.returnFormTitle}
                        </div>
                        <div className="mt-1 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                          <div className="text-xs font-medium text-zinc-700">{t.returnItems}</div>
                          {(order.items as OrderItem[]).map((it) => (
                            <div key={it.id} className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                              <span className="min-w-0 flex-1 truncate text-zinc-700">
                                {it.productName ?? "—"}
                              </span>
                              <span className="shrink-0 text-zinc-500">{t.maxQty(it.qty)}</span>
                              <input
                                type="number"
                                min={0}
                                max={it.qty}
                                value={returnItemQtys[it.id] ?? 0}
                                onChange={(e) =>
                                  setReturnItemQtys((prev) => ({
                                    ...prev,
                                    [it.id]: Math.max(
                                      0,
                                      Math.min(it.qty, Number(e.target.value) || 0),
                                    ),
                                  }))
                                }
                                className="w-16 rounded border border-zinc-300 px-2 py-0.5 text-right text-sm"
                              />
                            </div>
                          ))}
                          <div className="mt-2 flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={createReturnSubmitting}
                              onClick={async () => {
                                const items = (order.items as OrderItem[])
                                  .map((it) => ({
                                    orderItemId: it.id,
                                    qtyReturned: returnItemQtys[it.id] ?? 0,
                                  }))
                                  .filter((x) => x.qtyReturned > 0);
                                if (items.length === 0) {
                                  pushToast("Оберіть кількість хоча б по одній позиції", "error");
                                  return;
                                }
                                setCreateReturnSubmitting(true);
                                try {
                                  const r = await fetch(`${apiBaseUrl}/orders/${orderId}/returns`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ items }),
                                    credentials: "include",
                                  });
                                  if (!r.ok) {
                                    const err = await r.json().catch(() => ({}));
                                    throw new Error(
                                      (err as { message?: string }).message ??
                                        "Не вдалося створити повернення",
                                    );
                                  }
                                  setShowCreateReturnForm(false);
                                  setReturnItemQtys({});
                                  await Promise.all([refreshReturns(), refreshOrder()]);
                                  onSaved?.();
                                } catch (e) {
                                  pushToast(
                                    e instanceof Error ? e.message : "Помилка створення повернення",
                                    "error",
                                  );
                                } finally {
                                  setCreateReturnSubmitting(false);
                                }
                              }}
                              className="rounded border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                            >
                              {createReturnSubmitting ? "…" : t.createReturn}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setShowCreateReturnForm(false);
                                setReturnItemQtys({});
                              }}
                              className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                            >
                              {strings.common.cancel}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setReturnItemQtys(
                                  Object.fromEntries(
                                    (order.items as OrderItem[]).map((it) => [it.id, it.qty]),
                                  ),
                                )
                              }
                              className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100"
                            >
                              {t.returnAll}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    <div className="min-w-0">
                      <div className="text-xs text-zinc-500">{t.delivery}</div>
                      <div className="mt-1 flex w-full max-w-full rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 shadow-inner">
                        <button
                          type="button"
                          disabled={saving}
                          aria-pressed={(order.deliveryMethod ?? deliveryMethod) === "PICKUP"}
                          onClick={async () => {
                            const v = "PICKUP" as const;
                            if (order.deliveryMethod === v) return;
                            setDeliveryMethod(v);
                            try {
                              await patchOrder({ deliveryMethod: v });
                              if (order)
                                setOrder((prev) => (prev ? { ...prev, deliveryMethod: v } : prev));
                            } catch {
                              setDeliveryMethod(order.deliveryMethod ?? "PICKUP");
                            }
                          }}
                          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition ${
                            (order.deliveryMethod ?? deliveryMethod) === "PICKUP"
                              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                              : "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                          }`}
                        >
                          {t.pickup}
                        </button>
                        <button
                          type="button"
                          disabled={saving}
                          aria-pressed={(order.deliveryMethod ?? deliveryMethod) === "NOVA_POSHTA"}
                          onClick={async () => {
                            if (!npModuleEffective) return;
                            const v = "NOVA_POSHTA" as const;
                            if (order.deliveryMethod === v) return;
                            setDeliveryMethod(v);
                            try {
                              await patchOrder({ deliveryMethod: v });
                              if (order)
                                setOrder((prev) => (prev ? { ...prev, deliveryMethod: v } : prev));
                            } catch {
                              setDeliveryMethod(order.deliveryMethod ?? "PICKUP");
                            }
                          }}
                          className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-sm font-semibold transition ${
                            (order.deliveryMethod ?? deliveryMethod) === "NOVA_POSHTA"
                              ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                              : npModuleEffective
                                ? "text-zinc-600 hover:bg-white/70 hover:text-zinc-900"
                                : "cursor-not-allowed text-zinc-400"
                          }`}
                          title={!npModuleEffective ? "Модуль Nova Poshta недоступний" : undefined}
                        >
                          {t.novaPoshta}
                        </button>
                      </div>
                    </div>

                    {npModuleEffective && order.deliveryMethod === "NOVA_POSHTA" ? (
                      <div>
                        <div className="text-xs text-zinc-500">{t.shipmentTtn}</div>
                        <div className="mt-1 space-y-2">
                          {shipmentRows.length > 0 ? (
                            shipmentRows.map((row) => (
                              <div key={row.shipmentId} className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                {row.ttnNumber ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openTtnEdit({
                                        shipmentId: row.shipmentId,
                                        ttnId: row.ttnId ?? undefined,
                                      })
                                    }
                                    className="max-w-full truncate font-medium text-zinc-900 underline-offset-2 hover:underline"
                                    title="Переглянути / редагувати ТТН"
                                  >
                                    № {row.ttnNumber}
                                  </button>
                                ) : (
                                  <span className="font-medium text-zinc-400">{t.noTtn}</span>
                                )}
                                <span className="text-xs text-zinc-500">
                                  {formatShipmentStatus(row.shipmentStatus ?? "DRAFT")}
                                </span>
                                {row.ttnNumber ? (
                                  <TtnStatusBadge
                                    statusCode={row.ttnStatusCode}
                                    statusText={row.ttnStatusText}
                                  />
                                ) : null}
                                {row.ttnNumber ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openTtnEdit({
                                        shipmentId: row.shipmentId,
                                        ttnId: row.ttnId ?? undefined,
                                      })
                                    }
                                    className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                                    title="Переглянути / редагувати ТТН"
                                    aria-label="Переглянути / редагувати ТТН"
                                  >
                                    <svg
                                      className="h-4 w-4"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                      />
                                    </svg>
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: "Відв'язати ТТН",
                                      message: "Відв'язати ТТН тільки від цього замовлення?",
                                      confirmText: "Відв'язати",
                                      destructive: true,
                                    });
                                    if (!ok) return;
                                    try {
                                      await apiHttp.delete(
                                        `shipments/${row.shipmentId}/np/ttn/unlink`,
                                      );
                                      await refreshOrder();
                                      onSaved?.();
                                    } catch {
                                      // ignore
                                    }
                                  }}
                                  className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                                  title="Відв'язати ТТН від цього замовлення"
                                  aria-label="Відв'язати ТТН від цього замовлення"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M10 14l-2 2a3 3 0 01-4-4l2-2m8-4l2-2a3 3 0 114 4l-2 2M8 16l8-8"
                                    />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: "Скасувати ТТН",
                                      message: "Скасувати цю ТТН у Новій Пошті?",
                                      confirmText: "Скасувати",
                                      destructive: true,
                                    });
                                    if (!ok) return;
                                    try {
                                      await apiHttp.delete(`shipments/${row.shipmentId}/np/ttn`);
                                      await refreshOrder();
                                      onSaved?.();
                                    } catch (e) {
                                      const msg =
                                        (e as { response?: { data?: { message?: string } } })
                                          ?.response?.data?.message ??
                                        (e instanceof Error
                                          ? e.message
                                          : "Не вдалося видалити ТТН у НП");
                                      pushToast(msg, "error");
                                    }
                                  }}
                                  className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                                  title="Скасувати ТТН у Новій Пошті"
                                  aria-label="Скасувати ТТН у Новій Пошті"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              </div>
                            ))
                          ) : (
                            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                              {ttnNumber ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openTtnEdit({
                                        ttnId: order?.ttns?.[0]?.id,
                                      })
                                    }
                                    className="max-w-full truncate font-medium text-zinc-900 underline-offset-2 hover:underline"
                                    title="Переглянути / редагувати ТТН"
                                  >
                                    № {ttnNumber}
                                  </button>
                                  <TtnStatusBadge
                                    statusCode={ttnStatusCode}
                                    statusText={ttnStatusText}
                                  />
                                </>
                              ) : canShowCreateTtnButton ? (
                                <button
                                  type="button"
                                  onClick={openTtnCreate}
                                  className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5"
                                  title="Створити ТТН (НП)"
                                  aria-label="Створити ТТН"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M12 4v16m8-8H4"
                                    />
                                  </svg>
                                  {t.createTtn}
                                </button>
                              ) : (
                                <span className="font-normal text-zinc-400">{t.notSpecified}</span>
                              )}
                              {ttnNumber ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openTtnEdit({
                                      ttnId: order?.ttns?.[0]?.id,
                                    })
                                  }
                                  className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
                                  title="Переглянути / редагувати ТТН"
                                  aria-label="Переглянути / редагувати ТТН"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                    />
                                  </svg>
                                </button>
                              ) : null}
                              {ttnNumber && orderId ? (
                                <button
                                  type="button"
                                  onClick={async () => {
                                    const ok = await confirm({
                                      title: "Видалити ТТН",
                                      message: "Видалити ТТН із замовлення?",
                                      confirmText: "Видалити",
                                      destructive: true,
                                    });
                                    if (!ok) return;
                                    try {
                                      await apiHttp.delete(`orders/${orderId}/np/ttn`);
                                      await refreshOrder();
                                      onSaved?.();
                                    } catch {
                                      // ignore
                                    }
                                  }}
                                  className="rounded p-1.5 text-zinc-500 hover:bg-red-50 hover:text-red-600"
                                  title="Видалити ТТН"
                                  aria-label="Видалити ТТН"
                                >
                                  <svg
                                    className="h-4 w-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                    />
                                  </svg>
                                </button>
                              ) : null}
                            </div>
                          )}
                          {canShowCreateTtnButton && shipmentRows.length > 0 ? (
                            <button
                              type="button"
                              onClick={openTtnCreate}
                              className="btn-primary inline-flex items-center gap-1.5 px-3 py-1.5"
                              title="Створити ТТН (НП)"
                              aria-label="Створити ТТН"
                            >
                              <svg
                                className="h-4 w-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M12 4v16m8-8H4"
                                />
                              </svg>
                              {t.createTtn}
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-zinc-500">{t.comment}</div>
                    {editing === "comment" ? (
                      <textarea
                        rows={3}
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                        onKeyDown={async (e) => {
                          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                            const val = comment.trim() ? comment.trim() : null;
                            try {
                              await patchOrder({ comment: val });
                              if (order) {
                                setOrder((prev) => (prev ? { ...prev, comment: val } : prev));
                              }
                            } finally {
                              setEditing(null);
                            }
                          }
                        }}
                        onBlur={async () => {
                          const val = comment.trim() ? comment.trim() : null;
                          try {
                            await patchOrder({ comment: val });
                            if (order) {
                              setOrder((prev) => (prev ? { ...prev, comment: val } : prev));
                            }
                          } finally {
                            setEditing(null);
                          }
                        }}
                        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-500 focus:outline-none"
                        disabled={saving}
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setComment(order.comment ?? "");
                          setEditing("comment");
                        }}
                        className="mt-1 w-full text-left text-sm text-zinc-800 hover:bg-zinc-50 rounded-md px-2 py-1"
                      >
                        {order.comment ? (
                          <span className="whitespace-pre-wrap">{order.comment}</span>
                        ) : (
                          <span className="text-zinc-400">{t.addCommentHint}</span>
                        )}
                      </button>
                    )}
                    {editing === "comment" ? (
                      <div className="mt-1 text-xs text-zinc-500">
                        {t.commentSaveHint}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-zinc-500">{t.responsible}</div>
                    <div className="mt-1">
                      <SearchableSelectLite
                        value={order.ownerId ?? ""}
                        options={responsibleOptions}
                        placeholder={t.selectResponsible}
                        disabled={saving || loadingUsers}
                        isLoading={loadingUsers}
                        onChange={async (id) => {
                          const next = id || null;
                          await patchOrder({ ownerId: next });
                          setOrder((prev) => (prev ? { ...prev, ownerId: next } : prev));
                        }}
                      />
                    </div>
                  </div>
                </div>
              </EntitySection>
              <EntitySection title={t.payment}>
                <OrderClientBalancePanel
                  orderId={orderId!}
                  currency={order.currency ?? "UAH"}
                  debtAmount={(() => {
                    const d = order.debtAmount;
                    if (d != null && Number.isFinite(Number(d))) return Math.max(0, Number(d));
                    return Math.max(
                      0,
                      Number(order.totalAmount ?? 0) -
                        Number(order.returnAdjustmentAmount ?? 0) -
                        Number(order.paidAmount ?? 0) -
                        Number(order.fxWriteOffAmount ?? 0),
                    );
                  })()}
                  exchangeRate={order.exchangeRate ?? null}
                  onApplied={async () => {
                    await refreshOrder();
                    onSaved?.();
                  }}
                />
                <OrderPaymentBlock
                  orderId={orderId!}
                  orderNumber={order.orderNumber}
                  apiBaseUrl={apiBaseUrl}
                  paidAmount={Number(order.paidAmount ?? 0)}
                  totalAmount={Math.max(
                    0,
                    Number(order.totalAmount ?? 0) - Number(order.returnAdjustmentAmount ?? 0),
                  )}
                  debtAmount={(() => {
                    const d = order.debtAmount;
                    if (d != null && Number.isFinite(Number(d))) return Math.max(0, Number(d));
                    return Math.max(
                      0,
                      Number(order.totalAmount ?? 0) -
                        Number(order.returnAdjustmentAmount ?? 0) -
                        Number(order.paidAmount ?? 0) -
                        Number(order.fxWriteOffAmount ?? 0),
                    );
                  })()}
                  creditAmount={Math.max(0, Number(order.creditAmount ?? 0))}
                  clientId={order.clientId ?? null}
                  paymentStatus={(order as { paymentStatus?: string }).paymentStatus}
                  currency={order.currency}
                  exchangeRate={order.exchangeRate ?? null}
                  fxWriteOffAmount={Number(order.fxWriteOffAmount ?? 0)}
                  onSaved={async () => {
                    await refreshOrder();
                    onSaved?.();
                  }}
                />
              </EntitySection>
            </>
          )
        }
        right={
          !isCreate && order && orderId && leftTab === "main" ? (
            <EntitySection title={t.tabActivity}>
              <OrderTimeline orderId={orderId} onItemsCountChange={setActivityTabCount} />
            </EntitySection>
          ) : null
        }
        canClose={canClose}
        onClose={onClose}
      />
      {!isCreate && orderId && order && npModuleEffective ? (
        <TtnModal
          apiBaseUrl={apiBaseUrl}
          open={showTtnModal}
          onClose={() => setShowTtnModal(false)}
          dialogMode={ttnModalMode}
          shipmentId={ttnModalShipmentId}
          ttnId={ttnModalTtnId}
          orderId={orderId}
          contactId={order.contactId ?? order.clientId ?? ""}
          defaultPerson={
            order.client
              ? {
                  firstName: order.client.firstName ?? "",
                  lastName: order.client.lastName ?? "",
                  phone: order.client.phone ?? "",
                }
              : undefined
          }
          onCreated={async () => {
            setShowTtnModal(false);
            setTtnModalMode("create");
            setTtnModalShipmentId(undefined);
            setTtnModalTtnId(undefined);
            await Promise.all([refreshOrder(), refreshTimeline()]);
            onSaved?.();
          }}
        />
      ) : null}
      {pendingReturnSettlement ? (
        <OrderReturnSettlementDialog
          returnId={pendingReturnSettlement.returnId}
          currency={order?.currency ?? "UAH"}
          onCancel={() => setPendingReturnSettlement(null)}
          onConfirm={async (settlement) => {
            try {
              await updateReturnStatus(
                pendingReturnSettlement.returnId,
                pendingReturnSettlement.nextStatus,
                settlement,
              );
              setPendingReturnSettlement(null);
            } catch (e) {
              pushToast(
                e instanceof Error ? e.message : "Не вдалося закрити повернення",
                "error",
              );
            }
          }}
        />
      ) : null}
      {order?.isFxVarianceCandidate && order.fxVariance && (
        <FxWriteOffModal
          order={{
            id: order.id,
            orderNumber: order.orderNumber,
            currency: order.currency,
            exchangeRate: order.exchangeRate,
            fxVariance: order.fxVariance,
          }}
          open={showFxWriteOff}
          onClose={() => setShowFxWriteOff(false)}
          onSuccess={() => {
            setShowFxWriteOff(false);
            void refreshOrder();
          }}
        />
      )}
    </>
  );
}
