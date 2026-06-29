import type { DeliveryMethod } from "@/components/order/DeliveryMethodSection";
import { ordersApi, type Order } from "@/lib/api/orders";
import { deferredDueDateFrom } from "@/lib/order-utils";
import { t } from "@/lib/i18n";
import type { Contact, DraftOrderLine, OrderItem } from "@/types/crm";

export type OrderFormSnapshot = {
  contact: Contact | null;
  companyId: string | null;
  lines: DraftOrderLine[];
  warehouseId: string | null;
  paymentType: string | null;
  paymentMethod: string;
  bankAccountId: string | null;
  paymentDueDate: string;
  discountAmount: number;
  documentsRequested: boolean;
  deliveryMethod: DeliveryMethod;
  selectedProfileId: string | null;
  comment: string;
};

export function newDraftLineKey(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function orderItemsToDraftLines(items: OrderItem[]): DraftOrderLine[] {
  return items.map((item) => ({
    key: item.id,
    itemId: item.id,
    productId: item.productId ?? "",
    productName: item.productName ?? item.productNameSnapshot ?? t("orderCreate.productFallback"),
    qty: item.qty,
    price: item.price,
    discountPercent: item.discountPercent ?? 0,
  }));
}

function lineChanged(a: DraftOrderLine, b: DraftOrderLine): boolean {
  return a.qty !== b.qty || a.price !== b.price || a.discountPercent !== b.discountPercent;
}

export async function applyItemDiff(
  token: string,
  orderId: string,
  originalLines: DraftOrderLine[],
  draftLines: DraftOrderLine[],
): Promise<Order> {
  const originalById = new Map(
    originalLines.filter((l) => l.itemId).map((l) => [l.itemId!, l]),
  );
  const draftById = new Map(draftLines.filter((l) => l.itemId).map((l) => [l.itemId!, l]));
  let order: Order | null = null;

  for (const orig of originalLines) {
    if (!orig.itemId) continue;
    if (!draftById.has(orig.itemId)) {
      order = await ordersApi.removeItem(token, orderId, orig.itemId);
    }
  }

  for (const line of draftLines) {
    if (line.itemId) {
      const orig = originalById.get(line.itemId);
      if (orig && lineChanged(orig, line)) {
        order = await ordersApi.updateItem(token, orderId, line.itemId, {
          qty: line.qty,
          price: line.price,
          discountPercent: line.discountPercent || undefined,
        });
      }
      continue;
    }
    order = await ordersApi.addItem(token, orderId, {
      productId: line.productId,
      qty: line.qty,
      price: line.price,
      discountPercent: line.discountPercent || undefined,
    });
  }

  if (!order) {
    order = await ordersApi.getById(token, orderId);
  }
  return order;
}

function buildHeaderPatch(
  snapshot: OrderFormSnapshot,
  npEnabled: boolean,
): Parameters<typeof ordersApi.patch>[2] {
  const contact = snapshot.contact;
  const companyId =
    snapshot.companyId ?? contact?.company?.id ?? contact?.companyId ?? null;

  const patch: Parameters<typeof ordersApi.patch>[2] = {
    contactId: contact?.id ?? null,
    clientId: contact?.id ?? null,
    companyId,
    comment: snapshot.comment.trim() || null,
    discountAmount: snapshot.discountAmount || 0,
    documentsRequested: snapshot.documentsRequested,
    deliveryMethod: snapshot.deliveryMethod,
    paymentType: snapshot.paymentType,
    paymentMethod: snapshot.paymentMethod,
    bankAccountId: snapshot.paymentMethod === "FOP" ? snapshot.bankAccountId : null,
    warehouseId: snapshot.warehouseId ?? undefined,
    paymentDueDate:
      snapshot.paymentType === "DEFERRED"
        ? snapshot.paymentDueDate.trim() || deferredDueDateFrom()
        : null,
  };

  if (snapshot.deliveryMethod === "NOVA_POSHTA" && npEnabled && snapshot.selectedProfileId) {
    patch.deliveryData = {
      novaPoshta: { shippingProfileId: snapshot.selectedProfileId },
    };
  } else if (snapshot.deliveryMethod === "PICKUP") {
    patch.deliveryData = null;
  }

  return patch;
}

export async function saveOrderFull(
  token: string,
  orderId: string,
  snapshot: OrderFormSnapshot,
  originalLines: DraftOrderLine[],
  npEnabled: boolean,
): Promise<Order> {
  let order = await ordersApi.patch(token, orderId, buildHeaderPatch(snapshot, npEnabled));
  order = await applyItemDiff(token, orderId, originalLines, snapshot.lines);
  return order;
}

export async function createOrderFull(
  token: string,
  snapshot: OrderFormSnapshot,
  npEnabled: boolean,
): Promise<Order> {
  const contact = snapshot.contact;
  if (!contact || !snapshot.paymentType) {
    throw new Error("Missing contact or payment type");
  }

  let order = await ordersApi.create(token, {
    contactId: contact.id,
    clientId: contact.id,
    companyId: snapshot.companyId ?? contact.company?.id ?? contact.companyId ?? null,
    comment: snapshot.comment.trim() || undefined,
    discountAmount: snapshot.discountAmount || 0,
    documentsRequested: snapshot.documentsRequested,
    deliveryMethod: snapshot.deliveryMethod,
    paymentType: snapshot.paymentType,
    paymentMethod: snapshot.paymentMethod,
    bankAccountId: snapshot.paymentMethod === "FOP" ? snapshot.bankAccountId : null,
    warehouseId: snapshot.warehouseId ?? undefined,
  });

  for (const line of snapshot.lines) {
    order = await ordersApi.addItem(token, order.id, {
      productId: line.productId,
      qty: line.qty,
      price: line.price,
      discountPercent: line.discountPercent || undefined,
    });
  }

  order = await ordersApi.patch(token, order.id, buildHeaderPatch(snapshot, npEnabled));
  return order;
}
