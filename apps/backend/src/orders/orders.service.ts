import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { DeliveryMethod, PaymentMethod, PaymentType, Prisma } from "@prisma/client";
import type { OrderFinancialStatus, OrderStage } from "@prisma/client";
import {
  ActivityType,
  CustomFieldEntityType,
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  ReservationHardness,
  ReservationStatus,
  UserRole,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import {
  assertWarehouseOrderItemQtyUpdate,
  assertWarehouseOrderMutation,
  assertWarehouseOrderUpdate,
  assertWarehouseSplitByStock,
  assertWarehouseStageTransition,
  WAREHOUSE_FULFILLMENT_QUEUE_STAGES,
} from "./order-warehouse-role";
import { IntegrationPortsService } from "../integration-ports/integration-ports.service";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { computeOrderExchangeRate, getBaseCurrency } from "../common/currency.util";
import { WarehousesService } from "../warehouses/warehouses.service";
import type { AddOrderItemDto } from "./dto/add-order-item.dto";
import type { CreateOrderDto } from "./dto/create-order.dto";
import type { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import type { UpdateOrderDto } from "./dto/update-order.dto";
import {
  computeFinancialStatusFromOrder,
  financialBoardDefaultWhere,
  financialDueSoonWhere,
  financialOverdueWhere,
  financialStatusListWhere,
  legacyStatusToOrderStage,
  legacyStatusesForOrderStages,
  orderStageToDeliveryStatus,
  orderStageToLegacyStatus,
} from "./order-status-sync.mapper";
import { orderHasTtnRecord } from "./order-stage-prerequisites";
import { validateOrderStageTransition } from "./order-stage-transitions";
import { assertOrderReadyForCompletion, getOrderCompletionBlockers } from "./order-completion-guards";
import {
  computeOrderStockReadiness,
  type OrderStockReadiness,
} from "./order-stock-readiness";
import { OrdersPipelineConfigService } from "./pipeline/orders-pipeline-config.service";
import { WorkflowDomainEmitterService } from "../workflows/workflow-domain-emitter.service";
import { OrderWarehouseNotifierService } from "../notifications/order-warehouse-notifier.service";
import { computeLineTotal } from "./order-line-total.utils";

const ORDER_INCLUDE = {
  company: true,
  client: true,
  contact: true,
  bankAccount: { select: { id: true, name: true } },
  warehouse: { select: { id: true, name: true } },
  items: { include: { product: true } },
  ttns: { orderBy: { createdAt: "desc" as const } },
  shipments: {
    orderBy: { createdAt: "desc" as const },
    include: {
      items: true,
      ttns: { orderBy: { createdAt: "desc" as const } },
    },
  },
  parentOrder: { select: { id: true, orderNumber: true } },
  childOrders: {
    select: { id: true, orderNumber: true, orderStage: true },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

/** Stages where splitting would conflict with shipment / closure. */
const SPLIT_BLOCKED_ORDER_STAGES: OrderStage[] = [
  "SHIPPED",
  "AWAITING_RECEIPT",
  "RECEIVED",
  "COMPLETED",
  "CANCELED",
  "REFUSED",
  "RETURN_IN_PROGRESS",
];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private static readonly STAGES_WITH_ACTIVE_RESERVATION = new Set<OrderStage>([
    "NEW",
    "CONFIRMED",
    "AWAITING_PAYMENT",
    "AWAITING_STOCK",
    "READY_TO_SHIP",
  ]);
  private static readonly STAGES_RELEASE_RESERVATION = new Set<OrderStage>([
    "CANCELED",
    "REFUSED",
    "RETURN_IN_PROGRESS",
  ]);
  private static readonly STAGES_CONSUME_RESERVATION = new Set<OrderStage>([
    "SHIPPED",
    "AWAITING_RECEIPT",
    "RECEIVED",
    "COMPLETED",
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly warehousesService: WarehousesService,
    private readonly settings: SettingsService,
    private readonly integrations: IntegrationPortsService,
    private readonly ordersPipelineConfig: OrdersPipelineConfigService,
    private readonly workflowEmitter: WorkflowDomainEmitterService,
    private readonly warehouseNotifier: OrderWarehouseNotifierService,
  ) {}

  private num(v: unknown, fallback = 0) {
    const n = typeof v === "string" ? Number(v) : (v as number);
    return Number.isFinite(n) ? n : fallback;
  }

  private async assertAllowedDiscountPercent(discountPercent: number): Promise<void> {
    if (discountPercent === 0) return;
    const { percents } = await this.settings.getOrderLineDiscounts();
    if (!percents.includes(discountPercent)) {
      throw new BadRequestException(
        `Discount ${discountPercent}% is not allowed. Allowed: ${percents.join(", ")}%`,
      );
    }
  }

  /** MANAGER может работать только с заказами, где ownerId === actor.id. ADMIN и LEAD — полный доступ. */
  private assertOrderAccess(order: { ownerId: string | null }, actor: AuthUser): void {
    if (actor.role === UserRole.MANAGER && order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access orders assigned to you");
    }
  }

  private effectiveOrderIdForTtn(row: {
    orderId: string | null;
    shipment: { orderId: string } | null;
  }): string | null {
    return row.orderId ?? row.shipment?.orderId ?? null;
  }

  /**
   * For the given order IDs, returns for each order whether any TTN is shared and
   * a list of other order IDs linked by the same TTN number.
   */
  private async computeTtnSharedAcrossOrdersMeta(
    orderIds: string[],
  ): Promise<Map<string, { shared: boolean; relatedOrderIds: string[] }>> {
    const out = new Map<string, { shared: boolean; relatedOrderIds: string[] }>();
    for (const id of orderIds) out.set(id, { shared: false, relatedOrderIds: [] });
    if (orderIds.length === 0) return out;

    const pageTtns = await this.prisma.orderTtn.findMany({
      where: {
        OR: [{ orderId: { in: orderIds } }, { shipment: { orderId: { in: orderIds } } }],
      },
      select: {
        documentNumber: true,
        orderId: true,
        shipment: { select: { orderId: true } },
      },
    });

    const rawDocNumbers = Array.from(
      new Set(
        pageTtns
          .map((t) => t.documentNumber)
          .filter((d) => d != null && String(d).trim().length > 0) as string[],
      ),
    );

    if (rawDocNumbers.length === 0) return out;

    const allRows = await this.prisma.orderTtn.findMany({
      where: { documentNumber: { in: rawDocNumbers } },
      select: {
        documentNumber: true,
        orderId: true,
        shipment: { select: { orderId: true } },
      },
    });

    const orderIdsByNorm = new Map<string, Set<string>>();
    for (const t of allRows) {
      const oid = this.effectiveOrderIdForTtn(t);
      if (!oid) continue;
      const norm = String(t.documentNumber ?? "").trim();
      if (!norm) continue;
      let set = orderIdsByNorm.get(norm);
      if (!set) {
        set = new Set();
        orderIdsByNorm.set(norm, set);
      }
      set.add(oid);
    }

    const sharedNorms = new Set<string>();
    for (const [norm, ids] of orderIdsByNorm) {
      if (ids.size > 1) sharedNorms.add(norm);
    }

    for (const t of pageTtns) {
      const oid = this.effectiveOrderIdForTtn(t);
      if (!oid) continue;
      const norm = String(t.documentNumber ?? "").trim();
      if (!sharedNorms.has(norm)) continue;
      const relatedIds = orderIdsByNorm.get(norm);
      if (!relatedIds) continue;
      const current = out.get(oid) ?? { shared: false, relatedOrderIds: [] };
      current.shared = true;
      for (const relatedId of relatedIds) {
        if (relatedId !== oid && !current.relatedOrderIds.includes(relatedId)) {
          current.relatedOrderIds.push(relatedId);
        }
      }
      out.set(oid, current);
    }

    return out;
  }

  private calc(subtotal: number, discount: number, paid: number) {
    const s = this.num(subtotal, 0);
    const d = Math.max(0, this.num(discount, 0));
    const p = Math.max(0, this.num(paid, 0));
    const total = Math.max(0, s - d);
    const debt = Math.max(0, total - p);
    return { subtotal: s, discount: d, total, paid: p, debt };
  }

  private async syncActiveReservationsForOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        warehouseId: true,
        orderStage: true,
        items: {
          select: {
            productId: true,
            qty: true,
            qtyShipped: true,
          },
        },
      },
    });
    if (!order) return;
    const stage = order.orderStage ?? "NEW";
    const shouldKeepActive = OrdersService.STAGES_WITH_ACTIVE_RESERVATION.has(stage);

    await this.prisma.materialReservation.updateMany({
      where: { orderId, status: ReservationStatus.ACTIVE },
      data: {
        status: shouldKeepActive ? ReservationStatus.RELEASED : ReservationStatus.CONSUMED,
      },
    });

    if (!shouldKeepActive) return;

    const qtyByProduct = new Map<string, number>();
    for (const item of order.items) {
      if (!item.productId) continue;
      const remainingQty = Math.max(0, Number(item.qty) - Number(item.qtyShipped ?? 0));
      if (remainingQty <= 0) continue;
      qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) ?? 0) + remainingQty);
    }
    if (qtyByProduct.size === 0) return;

    await this.prisma.materialReservation.createMany({
      data: Array.from(qtyByProduct.entries()).map(([productId, qty]) => ({
        productId,
        warehouseId: order.warehouseId ?? null,
        qty,
        hardness: ReservationHardness.HARD,
        status: ReservationStatus.ACTIVE,
        orderId,
      })),
    });
  }

  async list(q: ListOrdersQueryDto, actor?: AuthUser) {
    const page = Math.max(1, this.num(q?.page, 1));
    const pageSize = Math.min(100, Math.max(1, this.num(q?.pageSize, 50)));
    const skip = (page - 1) * pageSize;

    const where: Prisma.OrderWhereInput = {};
    const andWhere: Prisma.OrderWhereInput[] = [];
    if (q?.companyId) where.companyId = String(q.companyId);
    if (q?.clientId) where.clientId = String(q.clientId);
    if (q?.contactId) where.contactId = String(q.contactId);
    if (q?.board === true && q?.financialBoard !== true) {
      // Phase 3: board shows "active" orders by orderStage; skip when financial board requested
      const closedStages: OrderStage[] = [
        "COMPLETED",
        "CANCELED",
        "REFUSED",
        "RETURN_IN_PROGRESS",
      ];
      where.OR = [
        { orderStage: { notIn: closedStages } },
        { orderStage: null },
      ];
    } else if (q?.status) {
      // Phase 7: map legacy status filter to orderStage so UI/API still works
      const stage = legacyStatusToOrderStage(q.status as OrderStatus);
      where.orderStage = stage;
    }
    if (q?.orderStages) {
      const stages = q.orderStages
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean) as OrderStage[];
      if (stages.length > 0) {
        const legacyStatuses = legacyStatusesForOrderStages(stages);
        andWhere.push({
          OR: [
            { orderStage: { in: stages } },
            ...(legacyStatuses.length > 0
              ? [{ orderStage: null, status: { in: legacyStatuses } }]
              : []),
          ],
        });
      }
    } else if (q?.orderStage) {
      where.orderStage = q.orderStage as OrderStage;
    }
    if (q?.financialStatus) {
      andWhere.push(financialStatusListWhere(q.financialStatus as OrderFinancialStatus));
    }
    if (q?.overdue === true) andWhere.push(financialOverdueWhere());
    if (q?.dueSoon === true) andWhere.push(financialDueSoonWhere());
    if (
      q?.financialBoard === true &&
      !q?.financialStatus &&
      q?.overdue !== true &&
      q?.dueSoon !== true
    ) {
      andWhere.push(financialBoardDefaultWhere());
    }
    if (q?.hasDebt === true) andWhere.push({ debtAmount: { gt: 0 } });
    if (q?.hasDueDate === true) andWhere.push({ paymentDueDate: { not: null } });
    if (q?.ownerId) where.ownerId = String(q.ownerId);
    if (q?.warehouseIds) {
      const warehouseIds = q.warehouseIds
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (warehouseIds.length > 0) {
        where.warehouseId = { in: warehouseIds };
      }
    }
    if (actor?.role === UserRole.MANAGER) {
      where.OR = [{ ownerId: actor.id }, { orderSource: OrderSource.STORE }];
    }
    if (q?.paymentType) where.paymentType = q.paymentType;
    if (q?.parentOrderId) where.parentOrderId = String(q.parentOrderId);
    if (q?.hasTtn === true) {
      andWhere.push({
        OR: [{ ttns: { some: {} } }, { shipments: { some: { ttns: { some: {} } } } }],
      });
    }
    if (q?.hasTtn === false) {
      andWhere.push({
        AND: [{ ttns: { none: {} } }, { shipments: { none: { ttns: { some: {} } } } }],
      });
    }

    if (q?.amountFrom != null || q?.amountTo != null) {
      const totalAmount: Prisma.FloatFilter = {};
      if (q?.amountFrom != null && Number.isFinite(Number(q.amountFrom))) {
        totalAmount.gte = Number(q.amountFrom);
      }
      if (q?.amountTo != null && Number.isFinite(Number(q.amountTo))) {
        totalAmount.lte = Number(q.amountTo);
      }
      if (totalAmount.gte != null || totalAmount.lte != null) {
        andWhere.push({ totalAmount });
      }
    }

    if (q?.paymentStatus) {
      switch (q.paymentStatus) {
        case OrderPaymentStatus.UNPAID:
          andWhere.push({ paidAmount: { lte: 0 } });
          break;
        case OrderPaymentStatus.PARTIALLY_PAID:
          andWhere.push({ paidAmount: { gt: 0 }, debtAmount: { gt: 0 } });
          break;
        case OrderPaymentStatus.PAID:
          andWhere.push({ paidAmount: { gt: 0 }, debtAmount: { lte: 0 } });
          break;
        case OrderPaymentStatus.OVERPAID:
          andWhere.push({ paidAmount: { gt: 0 }, debtAmount: { lte: 0 } });
          break;
        default:
          break;
      }
    }

    const search = q?.q?.trim();
    if (search) {
      const phoneDigits = search.replace(/\D/g, "");
      const ttnDigits = phoneDigits;
      andWhere.push({
        OR: [
          { orderNumber: { contains: search, mode: "insensitive" } },
          { invoiceNumber: { contains: search, mode: "insensitive" } },
          { waybillNumber: { contains: search, mode: "insensitive" } },
          {
            company: {
              is: { name: { contains: search, mode: "insensitive" } },
            },
          },
          {
            client: {
              is: {
                OR: [
                  { firstName: { contains: search, mode: "insensitive" } },
                  { lastName: { contains: search, mode: "insensitive" } },
                  {
                    AND: search.includes(" ")
                      ? search
                          .split(/\s+/)
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((part) => ({
                            OR: [
                              { firstName: { contains: part, mode: "insensitive" } },
                              { lastName: { contains: part, mode: "insensitive" } },
                            ],
                          }))
                      : [],
                  },
                  { phone: { contains: search, mode: "insensitive" } },
                  ...(phoneDigits.length >= 5
                    ? [{ phoneNormalized: { contains: phoneDigits } }]
                    : []),
                ],
              },
            },
          },
          // TTN: legacy direct attachment to order + current via shipment
          {
            ttns: {
              some: { documentNumber: { contains: search, mode: "insensitive" } },
            },
          },
          {
            shipments: {
              some: {
                ttns: {
                  some: { documentNumber: { contains: search, mode: "insensitive" } },
                },
              },
            },
          },
          // TTN numbers are usually entered with spaces / dashes — match by digits only.
          ...(ttnDigits.length >= 5
            ? [
                {
                  ttns: {
                    some: { documentNumber: { contains: ttnDigits } },
                  },
                },
                {
                  shipments: {
                    some: {
                      ttns: {
                        some: { documentNumber: { contains: ttnDigits } },
                      },
                    },
                  },
                },
              ]
            : []),
          // Product search: legacy snapshot + linked Product
          {
            items: {
              some: {
                OR: [
                  { productNameSnapshot: { contains: search, mode: "insensitive" } },
                  { product: { name: { contains: search, mode: "insensitive" } } },
                ],
              },
            },
          },
        ],
      });
    }

    if (q?.dateFrom || q?.dateTo) {
      const createdAt: Prisma.DateTimeFilter = {};
      if (q?.dateFrom) {
        const from = new Date(q.dateFrom);
        if (!Number.isNaN(from.getTime())) {
          createdAt.gte = from;
        }
      }
      if (q?.dateTo) {
        const to = new Date(q.dateTo);
        if (!Number.isNaN(to.getTime())) {
          const hasTime = q.dateTo.includes("T");
          if (!hasTime) to.setHours(23, 59, 59, 999);
          createdAt.lte = to;
        }
      }
      if (createdAt.gte || createdAt.lte) {
        andWhere.push({ createdAt });
      }
    }

    if (andWhere.length > 0) {
      where.AND = andWhere;
    }

    const sortBy = q?.sortBy ?? "createdAt";
    const sortDir: Prisma.SortOrder = q?.sortDir === "asc" ? "asc" : "desc";

    const withRelations = q?.withCompanyClient === true;
    const include: Prisma.OrderInclude = {
      items: true,
      warehouse: { select: { id: true, name: true } },
      _count: { select: { ttns: true, shipments: true } },
    };
    if (withRelations) {
      include.company = true;
      include.client = true;
    }

    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        skip,
        take: pageSize,
        include,
      }),
      this.prisma.order.count({ where }),
    ]);

    const ownerIds = Array.from(new Set(items.map((o) => o.ownerId).filter(Boolean)));
    const owners =
      ownerIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, fullName: true, email: true },
          })
        : [];
    const ownerById = new Map(owners.map((o) => [o.id, o]));

    const productIds = Array.from(
      new Set(
        items.flatMap((order) =>
          order.items.map((item) => item.productId).filter((id): id is string => Boolean(id)),
        ),
      ),
    );
    const products =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, sku: true, name: true },
          })
        : [];
    const productById = new Map(products.map((product) => [product.id, product]));

    const pageOrderIds = items.map((o) => o.id);
    const ttnSharedMeta = await this.computeTtnSharedAcrossOrdersMeta(pageOrderIds);
    const relatedOrderIds = Array.from(
      new Set(
        pageOrderIds.flatMap((id) => ttnSharedMeta.get(id)?.relatedOrderIds ?? []),
      ),
    );
    const relatedOrders =
      relatedOrderIds.length > 0
        ? await this.prisma.order.findMany({
            where: { id: { in: relatedOrderIds } },
            select: { id: true, orderNumber: true },
          })
        : [];
    const relatedOrderById = new Map(relatedOrders.map((o) => [o.id, o.orderNumber]));
    const stockReadinessByOrderId = await this.buildStockReadinessByOrderId(items);

    return {
      items: items.map((o) => {
        const paidAmount = o.paidAmount ?? 0;
        const totalAmount = o.totalAmount ?? 0;
        const owner = ownerById.get(o.ownerId);
        const base = {
          id: o.id,
          orderNumber: o.orderNumber,
          orderSource: o.orderSource,
          parentOrderId: o.parentOrderId ?? null,
          companyId: o.companyId,
          clientId: o.clientId,
          ownerId: o.ownerId,
          owner: owner
            ? {
                id: owner.id,
                fullName: owner.fullName,
                email: owner.email,
              }
            : null,
          status: o.status,
          orderStage: o.orderStage ?? null,
          deliveryStatus: o.deliveryStatus ?? null,
          financialStatus: computeFinancialStatusFromOrder({
            paymentType: o.paymentType,
            paidAmount: o.paidAmount ?? 0,
            totalAmount: o.totalAmount ?? 0,
            debtAmount: o.debtAmount ?? 0,
            paymentDueDate: o.paymentDueDate,
            orderStage: o.orderStage,
          }),
          paymentDueDate: o.paymentDueDate ?? null,
          totalAmount: o.totalAmount,
          returnAdjustmentAmount: o.returnAdjustmentAmount ?? null,
          paidAmount: o.paidAmount,
          debtAmount: o.debtAmount,
          exchangeRate: o.exchangeRate ?? null,
          paymentStatus: this.calcPaymentStatus(paidAmount, totalAmount),
          isPaid: paidAmount >= totalAmount && totalAmount > 0,
          currency: o.currency,
          paymentType: o.paymentType,
          paymentMethod: o.paymentMethod ?? null,
          documentsRequested: o.documentsRequested ?? null,
          comment: o.comment ?? null,
          warehouseId: o.warehouseId ?? null,
          warehouse:
            "warehouse" in o && o.warehouse
              ? { id: o.warehouse.id, name: o.warehouse.name }
              : null,
          deliveryMethod: o.deliveryMethod ?? null,
          hasTtn: (o._count?.ttns ?? 0) > 0,
          ttnSharedAcrossOrders: ttnSharedMeta.get(o.id)?.shared === true,
          ttnSharedWithOrders:
            ttnSharedMeta
              .get(o.id)
              ?.relatedOrderIds.map((relatedId) => ({
                id: relatedId,
                orderNumber: relatedOrderById.get(relatedId) ?? relatedId,
              })) ?? [],
          createdAt: o.createdAt,
          items: o.items.map((item) => ({
            id: item.id,
            productId: item.productId ?? null,
            productNameSnapshot: item.productNameSnapshot ?? null,
            qty: item.qty,
            product: item.productId
              ? (() => {
                  const p = productById.get(item.productId!);
                  return p ? { sku: p.sku, name: p.name } : null;
                })()
              : null,
          })),
          itemsCount: o.items.length,
          stockReadiness: stockReadinessByOrderId.get(o.id) ?? null,
        };
        if (withRelations && "company" in o && "client" in o) {
          return {
            ...base,
            company: o.company ? { id: o.company.id, name: o.company.name } : null,
            client: o.client
              ? {
                  id: o.client.id,
                  firstName: o.client.firstName,
                  lastName: o.client.lastName,
                }
              : null,
          };
        }
        return base;
      }),
      total,
      page,
      pageSize,
    };
  }

  async getById(id: string, actor?: AuthUser) {
    const o = await this.prisma.order.findUnique({
      where: { id },
      include: ORDER_INCLUDE,
    });
    if (!o) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(o, actor);
    const ttnSharedMeta = await this.computeTtnSharedAcrossOrdersMeta([id]);
    const relatedOrderIds = ttnSharedMeta.get(id)?.relatedOrderIds ?? [];
    const relatedOrders =
      relatedOrderIds.length > 0
        ? await this.prisma.order.findMany({
            where: { id: { in: relatedOrderIds } },
            select: { id: true, orderNumber: true },
          })
        : [];
    const completionBlockers = await getOrderCompletionBlockers(this.prisma, id, {
      paymentType: o.paymentType,
      paidAmount: o.paidAmount,
      totalAmount: o.totalAmount,
      subtotalAmount: o.subtotalAmount ?? 0,
      debtAmount: o.debtAmount,
      returnAdjustmentAmount: o.returnAdjustmentAmount,
      paymentDueDate: o.paymentDueDate,
    });
    return {
      ...this.mapToEntity(o),
      completionBlockers,
      ttnSharedAcrossOrders: ttnSharedMeta.get(id)?.shared === true,
      ttnSharedWithOrders: relatedOrders,
    };
  }

  async listFulfillmentQueue(actor?: AuthUser, warehouseIds?: string) {
    const result = await this.list(
      {
        orderStages: WAREHOUSE_FULFILLMENT_QUEUE_STAGES.join(","),
        warehouseIds: warehouseIds || undefined,
        page: 1,
        pageSize: 100,
        sortBy: "createdAt",
        sortDir: "asc",
        withCompanyClient: true,
      },
      actor,
    );
    const counts: Record<string, number> = { CONFIRMED: result.total };
    return { items: result.items, total: result.total, counts };
  }

  async create(dto: CreateOrderDto, actor?: AuthUser) {
    assertWarehouseOrderMutation(actor, "create order");
    // When authenticated, use current user as owner; otherwise require body (e.g. API).
    const ownerId = actor?.id ?? dto.ownerId ?? undefined;
    if (!ownerId) throw new BadRequestException("ownerId is required");
    const orderSource = dto.orderSource ?? OrderSource.CRM;
    let currency = "USD";
    const discountAmount = this.num(dto.discountAmount, 0);
    const paidAmount = 0;
    const a = this.calc(0, discountAmount, paidAmount);

    const warehouseId =
      dto.warehouseId ?? (await this.warehousesService.getDefaultWarehouseId());
    let exchangeRate: number | null = null;
    try {
      const rates = await this.settings.getExchangeRates();
      currency = getBaseCurrency(rates);
      exchangeRate = computeOrderExchangeRate(currency, rates);
    } catch (e) {
      this.logger.warn(`getExchangeRates failed at order create, exchangeRate will be null: ${e}`);
    }

    try {
      const order = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<[{ assigned: number }]>`
          UPDATE "OrderNumberSeq" SET "nextValue" = "nextValue" + 1
          RETURNING "nextValue" - 1 AS assigned
        `;
        const row = rows[0];
        if (!row) throw new InternalServerErrorException("OrderNumberSeq not initialized");
        const orderNumber = String(row.assigned);

        const financialStatus = computeFinancialStatusFromOrder({
          totalAmount: a.total,
          paidAmount: a.paid,
          debtAmount: a.debt,
          paymentType: dto.paymentType ?? null,
          orderStage: "NEW",
        });
        return tx.order.create({
          data: {
            orderNumber,
            companyId: dto.companyId ?? null,
            clientId: dto.clientId ?? null,
            contactId: dto.contactId ?? null,
            ownerId,
            orderSource,
            currency,
            subtotalAmount: a.subtotal,
            discountAmount: a.discount,
            totalAmount: a.total,
            paidAmount: a.paid,
            debtAmount: a.debt,
            comment: dto.comment ?? null,
            deliveryMethod: dto.deliveryMethod ?? null,
            paymentMethod: dto.paymentMethod ?? null,
            bankAccountId: dto.bankAccountId ?? null,
            warehouseId: warehouseId ?? null,
            documentsRequested: dto.documentsRequested ?? null,
            paymentType: dto.paymentType ?? null,
            deliveryData: (dto.deliveryData ?? undefined) as Prisma.InputJsonValue | undefined,
            orderStage: "NEW",
            deliveryStatus: "NOT_SHIPPED",
            financialStatus,
            exchangeRate,
          },
          include: ORDER_INCLUDE,
        });
      });

      const mapped = this.mapToEntity(order as unknown as Record<string, unknown>);
      this.workflowEmitter.emitRecordCreated(
        CustomFieldEntityType.ORDER,
        order.id,
        mapped as unknown as Record<string, unknown>,
      );
      return mapped;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`Order create failed: ${msg}`);
    }
  }

  async update(id: string, dto: UpdateOrderDto, actor?: AuthUser) {
    const existing = await this.prisma.order.findUnique({
      where: { id },
      include: {
        company: true,
        client: true,
        contact: true,
        items: { include: { product: true } },
        ttns: true,
      },
    });
    if (!existing) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(existing, actor);
    assertWarehouseOrderUpdate(actor, dto as unknown as Record<string, unknown>);
    const before = this.mapToEntity(existing as unknown as Record<string, unknown>);

    const data: Prisma.OrderUpdateInput = {};

    // relations
    // FK поля в Prisma "checked update" нельзя писать напрямую (companyId/clientId/contactId),
    // поэтому обновляем через relation-операции connect/disconnect.
    if ("companyId" in dto) {
      data.company = dto.companyId ? { connect: { id: dto.companyId } } : { disconnect: true };
    }

    if ("clientId" in dto) {
      data.client = dto.clientId ? { connect: { id: dto.clientId } } : { disconnect: true };
      // Sync contactId to clientId when only client is set, so TtnModal loads shipping profiles for the same contact
      if (dto.clientId && !("contactId" in dto)) {
        data.contact = { connect: { id: dto.clientId } };
      }
    }

    if ("contactId" in dto) {
      data.contact = dto.contactId ? { connect: { id: dto.contactId } } : { disconnect: true };
    }
    if ("ownerId" in dto) {
      const nextOwnerId = dto.ownerId ?? null;
      if (actor?.role === UserRole.MANAGER && nextOwnerId !== actor.id) {
        throw new ForbiddenException("You can only assign order to yourself");
      }
      if (nextOwnerId) {
        data.owner = { connect: { id: nextOwnerId } };
      }
    }
    if ("bankAccountId" in dto) {
      data.bankAccount = dto.bankAccountId
        ? { connect: { id: dto.bankAccountId } }
        : { disconnect: true };
    }
    if ("warehouseId" in dto) {
      data.warehouse = dto.warehouseId
        ? { connect: { id: dto.warehouseId } }
        : { disconnect: true };
    }

    // misc
    if ("comment" in dto) data.comment = dto.comment ? String(dto.comment) : null;

    // ✅ delivery/payment (was missing -> UI looked like it "reverts")
    if ("deliveryMethod" in dto)
      data.deliveryMethod = (dto.deliveryMethod as DeliveryMethod) ?? null;
    if ("paymentMethod" in dto) data.paymentMethod = (dto.paymentMethod as PaymentMethod) ?? null;
    if ("documentsRequested" in dto) data.documentsRequested = dto.documentsRequested ?? null;
    if ("paymentType" in dto) data.paymentType = (dto.paymentType as PaymentType) ?? null;
    if ("deliveryData" in dto)
      data.deliveryData = (dto.deliveryData ?? undefined) as Prisma.InputJsonValue | undefined;

    if ("paymentDueDate" in dto) {
      const raw = dto.paymentDueDate;
      if (raw === null || raw === "" || raw === undefined) {
        data.paymentDueDate = null;
      } else {
        const parsed = new Date(raw as string);
        data.paymentDueDate = Number.isNaN(parsed.getTime()) ? null : parsed;
      }
    }

    // amounts
    const nextDiscount =
      "discountAmount" in dto ? this.num(dto.discountAmount, 0) : existing.discountAmount;
    const nextPaid = "paidAmount" in dto ? this.num(dto.paidAmount, 0) : existing.paidAmount;
    const a = this.calc(existing.subtotalAmount, nextDiscount, nextPaid);

    if ("discountAmount" in dto) data.discountAmount = a.discount;
    if ("paidAmount" in dto) data.paidAmount = a.paid;

    // keep totals consistent and sync financialStatus when amounts or payment context change
    if ("discountAmount" in dto || "paidAmount" in dto) {
      data.totalAmount = a.total;
      data.debtAmount = a.debt;
      data.financialStatus = computeFinancialStatusFromOrder({
        paymentType: existing.paymentType,
        totalAmount: a.total,
        paidAmount: a.paid,
        debtAmount: a.debt,
        paymentDueDate: existing.paymentDueDate,
        orderStage: existing.orderStage ?? undefined,
      });
    } else if ("paymentDueDate" in dto || "paymentType" in dto) {
      const nextDue =
        "paymentDueDate" in dto
          ? (data.paymentDueDate as Date | null) ?? existing.paymentDueDate
          : existing.paymentDueDate;
      const nextType =
        ("paymentType" in dto ? data.paymentType : existing.paymentType) as PaymentType | null;
      const effectiveTotal = Math.max(
        0,
        (existing.totalAmount ?? 0) - (existing.returnAdjustmentAmount ?? 0),
      );
      data.financialStatus = computeFinancialStatusFromOrder({
        paymentType: nextType ?? undefined,
        totalAmount: effectiveTotal,
        paidAmount: existing.paidAmount,
        debtAmount: existing.debtAmount,
        paymentDueDate: nextDue ?? undefined,
        orderStage: existing.orderStage ?? undefined,
      });
    }

    const updated = await this.prisma.order.update({
      where: { id },
      data,
      include: ORDER_INCLUDE,
    });
    await this.syncActiveReservationsForOrder(id);
    const next = this.mapToEntity(updated as unknown as Record<string, unknown>);
    const keys = Object.keys(dto);
    const b = before as unknown as Record<string, unknown>;
    const n = next as unknown as Record<string, unknown>;
    const changes: Record<string, { previous?: unknown; current?: unknown }> = {};
    for (const k of keys) {
      if (b[k] !== n[k]) changes[k] = { previous: b[k], current: n[k] };
    }
    this.workflowEmitter.emitRecordUpdated(
      CustomFieldEntityType.ORDER,
      id,
      n,
      Object.keys(changes).length ? changes : undefined,
    );
    return next;
  }

  async addItem(orderId: string, dto: AddOrderItemDto, actor?: AuthUser) {
    assertWarehouseOrderMutation(actor, "add order item");
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, ownerId: true, currency: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(order, actor);

    const productId = dto.productId;
    const qty = Math.max(1, Math.trunc(dto.qty));
    const price = dto.price;
    const discountPercent = Math.max(0, Math.trunc(dto.discountPercent ?? 0));
    await this.assertAllowedDiscountPercent(discountPercent);

    const existing = await this.prisma.orderItem.findUnique({
      where: { orderId_productId: { orderId, productId } },
    });

    if (existing) {
      const nextQty = existing.qty + qty;
      const nextDiscount = dto.discountPercent != null ? discountPercent : existing.discountPercent;
      await this.prisma.orderItem.update({
        where: { id: existing.id },
        data: {
          qty: nextQty,
          price,
          discountPercent: nextDiscount,
          lineTotal: computeLineTotal(nextQty, price, nextDiscount),
        },
      });
    } else {
      await this.prisma.orderItem.create({
        data: {
          orderId,
          productId,
          qty,
          price,
          discountPercent,
          lineTotal: computeLineTotal(qty, price, discountPercent),
        },
      });
    }

    await this.syncActiveReservationsForOrder(orderId);
    return this.recalcAndReturn(orderId);
  }

  async updateItem(
    orderId: string,
    itemId: string,
    dto: { qty?: number; price?: number; discountPercent?: number },
    actor?: AuthUser,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, ownerId: true, orderStage: true, totalAmount: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(order, actor);
    assertWarehouseOrderItemQtyUpdate(actor, order.orderStage, dto);

    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException("Order item not found");

    const prevQty = item.qty;
    const prevTotalAmount = order.totalAmount ?? 0;
    const nextQty = dto.qty != null ? Math.max(1, Math.trunc(dto.qty)) : item.qty;
    const nextPrice = dto.price != null ? dto.price : item.price;
    const nextDiscount =
      dto.discountPercent != null
        ? Math.max(0, Math.trunc(dto.discountPercent))
        : item.discountPercent;
    await this.assertAllowedDiscountPercent(nextDiscount);

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        qty: nextQty,
        price: nextPrice,
        discountPercent: nextDiscount,
        lineTotal: computeLineTotal(nextQty, nextPrice, nextDiscount),
      },
    });

    await this.syncActiveReservationsForOrder(orderId);
    const updated = await this.recalcAndReturn(orderId);

    void this.warehouseNotifier.notifyQtyChanged({
      orderId,
      itemId,
      prevQty,
      nextQty,
      prevTotalAmount,
      nextTotalAmount: Number(updated.totalAmount ?? 0),
      actor,
    });

    return updated;
  }

  async removeItem(orderId: string, itemId: string, actor?: AuthUser) {
    assertWarehouseOrderMutation(actor, "remove order item");
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, ownerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(order, actor);

    const item = await this.prisma.orderItem.findFirst({
      where: { id: itemId, orderId },
    });
    if (!item) throw new NotFoundException("Order item not found");

    await this.prisma.orderItem.delete({ where: { id: itemId } });
    await this.syncActiveReservationsForOrder(orderId);
    return this.recalcAndReturn(orderId);
  }

  private async buildStockReadinessByOrderId(
    orders: Array<{
      id: string;
      orderStage: OrderStage | null;
      warehouseId: string | null;
      items: Array<{ productId: string | null; qty: number; qtyShipped: number }>;
    }>,
  ): Promise<Map<string, OrderStockReadiness>> {
    const awaiting = orders.filter((o) => o.orderStage === "AWAITING_STOCK");
    if (awaiting.length === 0) return new Map();

    const productIds = Array.from(
      new Set(
        awaiting.flatMap((o) =>
          o.items.map((item) => item.productId).filter((id): id is string => Boolean(id)),
        ),
      ),
    );
    const products =
      productIds.length > 0
        ? await this.prisma.product.findMany({
            where: { id: { in: productIds } },
            select: { id: true, stock: true },
          })
        : [];
    const productStockById = new Map(products.map((p) => [p.id, p.stock]));

    const warehouseIds = Array.from(
      new Set(awaiting.map((o) => o.warehouseId).filter((id): id is string => Boolean(id))),
    );
    const warehouseRows =
      warehouseIds.length > 0 && productIds.length > 0
        ? await this.prisma.productWarehouseStock.findMany({
            where: {
              warehouseId: { in: warehouseIds },
              productId: { in: productIds },
            },
            select: { warehouseId: true, productId: true, qty: true },
          })
        : [];
    const warehouseStockByKey = new Map(
      warehouseRows.map((r) => [`${r.warehouseId}:${r.productId}`, r.qty]),
    );

    const result = new Map<string, OrderStockReadiness>();
    for (const order of awaiting) {
      const readiness = computeOrderStockReadiness(
        order,
        productStockById,
        warehouseStockByKey,
      );
      if (readiness) result.set(order.id, readiness);
    }
    return result;
  }

  /**
   * Move shortage quantities to a new child order (parentOrderId). Payments stay on the parent (MVP).
   * Without picks: split by DB stock (warehouse row if present, else Product.stock).
   * With picks: split by found quantities during picking; child goes to AWAITING_STOCK.
   */
  async splitByStock(
    orderId: string,
    actor?: AuthUser,
    dto?: { picks?: Array<{ itemId: string; foundQty: number }> },
  ) {
    const parent = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!parent) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(parent, actor);

    const picks = dto?.picks;
    const hasPicks = picks != null && picks.length > 0;
    assertWarehouseSplitByStock(actor, parent.orderStage, hasPicks);

    const stage = parent.orderStage ?? "NEW";
    if (SPLIT_BLOCKED_ORDER_STAGES.includes(stage)) {
      throw new BadRequestException("Cannot split order in the current stage");
    }

    if (!parent.items.length) {
      throw new BadRequestException("Order has no lines to split");
    }

    for (const it of parent.items) {
      if (it.qtyShipped > 0) {
        throw new BadRequestException(
          "Cannot split: some lines already have shipped quantity. Split only before partial shipment.",
        );
      }
    }

    type Plan = {
      itemId: string;
      productId: string | null;
      keepQty: number;
      moveQty: number;
      price: number;
      discountPercent: number;
      snapshot: string | null;
    };

    let plans: Plan[];
    if (hasPicks) {
      const orderItemIds = new Set(parent.items.map((i) => i.id));
      for (const p of picks!) {
        if (!orderItemIds.has(p.itemId)) {
          throw new BadRequestException(`Unknown order item: ${p.itemId}`);
        }
      }
      const foundByItemId = new Map(
        picks!.map((p) => [p.itemId, Math.max(0, Math.trunc(p.foundQty))]),
      );
      plans = [];
      for (const it of parent.items) {
        const rawFound = foundByItemId.get(it.id) ?? it.qty;
        const keepQty = Math.min(it.qty, rawFound);
        const moveQty = it.qty - keepQty;
        if (moveQty > 0 && !it.productId) {
          throw new BadRequestException(
            "Cannot split: lines without a catalog product cannot be moved. Link a product first.",
          );
        }
        plans.push({
          itemId: it.id,
          productId: it.productId,
          keepQty,
          moveQty,
          price: it.price,
          discountPercent: it.discountPercent ?? 0,
          snapshot: it.productNameSnapshot,
        });
      }
    } else {
      const productIds = parent.items
        .map((i) => i.productId)
        .filter((id): id is string => id != null);

      const products =
        productIds.length > 0
          ? await this.prisma.product.findMany({
              where: { id: { in: productIds } },
              select: { id: true, stock: true },
            })
          : [];
      const productStockById = new Map(products.map((p) => [p.id, p.stock]));

      const warehouseStockByProductId = new Map<string, number>();
      if (parent.warehouseId && productIds.length > 0) {
        const whRows = await this.prisma.productWarehouseStock.findMany({
          where: { warehouseId: parent.warehouseId, productId: { in: productIds } },
        });
        for (const r of whRows) {
          warehouseStockByProductId.set(r.productId, r.qty);
        }
      }

      plans = [];
      for (const it of parent.items) {
        let available = 0;
        if (it.productId) {
          if (parent.warehouseId) {
            if (warehouseStockByProductId.has(it.productId)) {
              available = warehouseStockByProductId.get(it.productId) ?? 0;
            } else {
              available = productStockById.get(it.productId) ?? 0;
            }
          } else {
            available = productStockById.get(it.productId) ?? 0;
          }
        }

        const keepQty = Math.min(it.qty, Math.max(0, available));
        const moveQty = it.qty - keepQty;

        if (moveQty > 0 && !it.productId) {
          throw new BadRequestException(
            "Cannot split: lines without a catalog product cannot be moved. Link a product first.",
          );
        }

        plans.push({
          itemId: it.id,
          productId: it.productId,
          keepQty,
          moveQty,
          price: it.price,
          discountPercent: it.discountPercent ?? 0,
          snapshot: it.productNameSnapshot,
        });
      }
    }

    const totalMove = plans.reduce((s, p) => s + p.moveQty, 0);
    if (totalMove <= 0) {
      throw new BadRequestException(
        hasPicks
          ? "Nothing to split: all lines were found in full"
          : "Nothing to split: stock covers all lines",
      );
    }

    const totalKeep = plans.reduce((s, p) => s + p.keepQty, 0);
    if (hasPicks && totalKeep <= 0) {
      throw new BadRequestException("Nothing to ship: all lines are missing");
    }

    const childStage: OrderStage = hasPicks ? "AWAITING_STOCK" : "NEW";
    const changedBy = actor?.id ?? "system";

    const childId = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<[{ assigned: number }]>`
        UPDATE "OrderNumberSeq" SET "nextValue" = "nextValue" + 1
        RETURNING "nextValue" - 1 AS assigned
      `;
      const row = rows[0];
      if (!row) throw new InternalServerErrorException("OrderNumberSeq not initialized");
      const orderNumber = String(row.assigned);

      const discountAmount = this.num(parent.discountAmount, 0);
      const paidAmount = 0;
      const a = this.calc(0, discountAmount, paidAmount);
      const financialStatus = computeFinancialStatusFromOrder({
        totalAmount: a.total,
        paidAmount: a.paid,
        debtAmount: a.debt,
        paymentType: parent.paymentType,
        orderStage: childStage,
      });

      const child = await tx.order.create({
        data: {
          orderNumber,
          parentOrderId: parent.id,
          companyId: parent.companyId,
          clientId: parent.clientId,
          contactId: parent.contactId,
          ownerId: parent.ownerId,
          orderSource: parent.orderSource,
          currency: parent.currency,
          subtotalAmount: a.subtotal,
          discountAmount: a.discount,
          totalAmount: a.total,
          paidAmount: a.paid,
          debtAmount: a.debt,
          comment: hasPicks
            ? `Недостача при збірці з №${parent.orderNumber}`
            : `Частина замовлення з №${parent.orderNumber}`,
          deliveryMethod: parent.deliveryMethod,
          paymentMethod: parent.paymentMethod,
          bankAccountId: parent.bankAccountId,
          warehouseId: parent.warehouseId,
          documentsRequested: parent.documentsRequested,
          paymentType: parent.paymentType,
          paymentDueDate: parent.paymentDueDate,
          exchangeRate: parent.exchangeRate,
          orderStage: childStage,
          deliveryStatus: "NOT_SHIPPED",
          financialStatus,
          returnAdjustmentAmount: 0,
        },
      });

      for (const p of plans) {
        if (p.moveQty <= 0) continue;

        const existingChildLine = await tx.orderItem.findUnique({
          where: {
            orderId_productId: { orderId: child.id, productId: p.productId! },
          },
        });
        if (existingChildLine) {
          const nq = existingChildLine.qty + p.moveQty;
          const disc = existingChildLine.discountPercent ?? p.discountPercent;
          await tx.orderItem.update({
            where: { id: existingChildLine.id },
            data: {
              qty: nq,
              discountPercent: disc,
              lineTotal: computeLineTotal(nq, existingChildLine.price, disc),
            },
          });
        } else {
          await tx.orderItem.create({
            data: {
              orderId: child.id,
              productId: p.productId!,
              productNameSnapshot: p.snapshot,
              qty: p.moveQty,
              price: p.price,
              discountPercent: p.discountPercent,
              lineTotal: computeLineTotal(p.moveQty, p.price, p.discountPercent),
            },
          });
        }

        if (p.keepQty <= 0) {
          await tx.orderItem.delete({ where: { id: p.itemId } });
        } else {
          await tx.orderItem.update({
            where: { id: p.itemId },
            data: {
              qty: p.keepQty,
              lineTotal: computeLineTotal(p.keepQty, p.price, p.discountPercent),
            },
          });
        }
      }

      const activityTitle = hasPicks ? "Розділення при збірці" : "Розділення по залишках";
      const parentBody = hasPicks
        ? `Створено дочірнє замовлення №${orderNumber} (недостача при збірці → Очікує на склад). Оплати залишились на цьому замовленні.`
        : `Створено дочірнє замовлення №${orderNumber} (нестача на складі). Оплати залишились на цьому замовленні.`;
      const childBody = hasPicks
        ? `Виділено з батьківського замовлення №${parent.orderNumber} після збірки.`
        : `Виділено з батьківського замовлення №${parent.orderNumber}.`;

      await tx.activity.create({
        data: {
          type: ActivityType.COMMENT,
          title: activityTitle,
          body: parentBody,
          createdBy: changedBy,
          orderId: parent.id,
        },
      });
      await tx.activity.create({
        data: {
          type: ActivityType.COMMENT,
          title: activityTitle,
          body: childBody,
          createdBy: changedBy,
          orderId: child.id,
        },
      });

      return child.id;
    });

    await this.recalcAndReturn(orderId);
    await this.recalcAndReturn(childId);
    await this.syncActiveReservationsForOrder(orderId);
    await this.syncActiveReservationsForOrder(childId);

    const [parentEntity, childEntity] = await Promise.all([
      this.getById(orderId, actor),
      this.getById(childId, actor),
    ]);

    void this.warehouseNotifier.notifySplit({
      parentOrderId: orderId,
      childOrderId: childId,
      childOrderNumber: String(childEntity.orderNumber),
      actor,
    });

    return { parent: parentEntity, child: childEntity };
  }

  /** Only ADMIN can delete orders. */
  async remove(id: string, actor?: AuthUser) {
    if (!actor || actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only ADMIN can delete orders");
    }
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: { id: true, ownerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    await this.prisma.materialReservation.updateMany({
      where: { orderId: id, status: ReservationStatus.ACTIVE },
      data: { status: ReservationStatus.RELEASED },
    });
    await this.prisma.order.delete({ where: { id } });
    return { ok: true };
  }

  /**
   * Phase 2: Single entry point for changing order stage. Validates transitions and business rules,
   * updates orderStage, deliveryStatus, financialStatus, and legacy status; writes history.
   */
  async setOrderStage(
    id: string,
    toStage: OrderStage,
    actor: AuthUser | undefined,
    reason?: string | null,
  ) {
    const changedBy = actor?.id ?? "system";
    const current = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        contactId: true,
        contact: { select: { externalCode: true } },
        orderStage: true,
        status: true,
        paymentType: true,
        paidAmount: true,
        totalAmount: true,
        subtotalAmount: true,
        debtAmount: true,
        returnAdjustmentAmount: true,
        paymentDueDate: true,
        financialStatus: true,
        deliveryMethod: true,
        deliveryData: true,
        ttns: { take: 1, select: { id: true } },
        shipments: {
          where: { ttns: { some: {} } },
          take: 1,
          select: { id: true },
        },
      },
    });
    if (!current) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(current, actor);
    assertWarehouseStageTransition(actor, current.orderStage, toStage);

    if (current.orderStage === "NEW" && toStage !== "NEW") {
      const contactCode = current.contact?.externalCode?.trim();
      if (!contactCode) {
        throw new BadRequestException(
          "Cannot change stage from NEW: contact must have externalCode (Код1с)",
        );
      }
    }

    const hasTtn = orderHasTtnRecord({
      deliveryData: current.deliveryData,
      hasOrderTtn: (current.ttns?.length ?? 0) > 0,
      hasShipmentTtn: (current.shipments?.length ?? 0) > 0,
    });

    const transitionGraph = await this.ordersPipelineConfig.getEffectiveTransitionGraph();
    validateOrderStageTransition(current.orderStage, toStage, {
      orderStage: current.orderStage,
      paymentType: current.paymentType,
      paidAmount: current.paidAmount,
      totalAmount: current.totalAmount,
      debtAmount: current.debtAmount,
      returnAdjustmentAmount: current.returnAdjustmentAmount,
      paymentDueDate: current.paymentDueDate,
      deliveryMethod: current.deliveryMethod,
      hasTtn,
    }, transitionGraph);

    if (toStage === "COMPLETED") {
      const openReturnsCount = await this.prisma.orderReturn.count({
        where: { orderId: id, status: { not: "CLOSED" } },
      });
      if (openReturnsCount > 0) {
        throw new BadRequestException(
          "Cannot complete order while a return is in progress. Close the return first.",
        );
      }
      await assertOrderReadyForCompletion(this.prisma, id, {
        paymentType: current.paymentType,
        paidAmount: current.paidAmount,
        totalAmount: current.totalAmount,
        subtotalAmount: current.subtotalAmount ?? 0,
        debtAmount: current.debtAmount,
        returnAdjustmentAmount: current.returnAdjustmentAmount,
        paymentDueDate: current.paymentDueDate,
      });
    }

    if (toStage === "RETURN_IN_PROGRESS") {
      const openReturnsCount = await this.prisma.orderReturn.count({
        where: { orderId: id, status: { not: "CLOSED" } },
      });
      if (openReturnsCount === 0) {
        throw new BadRequestException(
          "Cannot set stage RETURN_IN_PROGRESS: order has no active returns",
        );
      }
    }

    const deliveryStatus = orderStageToDeliveryStatus(toStage);
    const financialStatus = computeFinancialStatusFromOrder({
      paymentType: current.paymentType,
      paidAmount: current.paidAmount,
      totalAmount: current.totalAmount,
      debtAmount: current.debtAmount,
      paymentDueDate: current.paymentDueDate,
      orderStage: toStage,
    });
    const legacyStatus = orderStageToLegacyStatus(toStage, {
      debtAmount: current.debtAmount,
    });

    await this.prisma.orderStatusHistory.create({
      data: {
        orderId: id,
        fromStatus: current.status ?? undefined,
        toStatus: legacyStatus,
        fromOrderStage: current.orderStage ?? undefined,
        toOrderStage: toStage,
        changedBy,
        reason: reason ?? null,
      },
    });

    const updated = await this.prisma.order.update({
      where: { id },
      data: {
        orderStage: toStage,
        deliveryStatus,
        financialStatus,
      },
      include: ORDER_INCLUDE,
    });
    if (OrdersService.STAGES_RELEASE_RESERVATION.has(toStage)) {
      await this.prisma.materialReservation.updateMany({
        where: { orderId: id, status: ReservationStatus.ACTIVE },
        data: { status: ReservationStatus.RELEASED },
      });
    } else if (OrdersService.STAGES_CONSUME_RESERVATION.has(toStage)) {
      await this.prisma.materialReservation.updateMany({
        where: { orderId: id, status: ReservationStatus.ACTIVE },
        data: { status: ReservationStatus.CONSUMED },
      });
    } else {
      await this.syncActiveReservationsForOrder(id);
    }

    if (toStage === "READY_TO_SHIP") {
      this.settings.getGoogleSheetSecrets().then(({ sendOnReadyToShip }) => {
        if (sendOnReadyToShip) {
          this.integrations.sendOrderToSheet(id, { exportDate: new Date() }).catch((err) => {
            if (err instanceof Error) this.logger.error(`Send to sheet failed: ${err.message}`);
          });
        }
      });
    }

    void this.warehouseNotifier.notifyStageChanged({
      orderId: id,
      fromStage: current.orderStage,
      toStage,
      actor,
    });

    return this.mapToEntity(updated);
  }

  /** Legacy endpoint: accepts legacy status, maps to orderStage and delegates to setOrderStage. */
  async setStatus(
    id: string,
    dto: { toStatus: OrderStatus; reason?: string | null; changedBy: string },
    actor?: AuthUser,
  ) {
    const toStage = legacyStatusToOrderStage(dto.toStatus);
    return this.setOrderStage(id, toStage, actor, dto.reason ?? null);
  }

  async getTimeline(orderId: string, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, ownerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(order, actor);

    const [history, activities, ttns] = await Promise.all([
      this.prisma.orderStatusHistory.findMany({
        where: { orderId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.activity.findMany({
        where: { orderId },
        orderBy: { createdAt: "desc" },
      }),
      this.prisma.orderTtn.findMany({
        where: { orderId },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    const items = [
      ...history.map((h) => {
        const toStage = (h as { toOrderStage?: string | null }).toOrderStage;
        const fromStage = (h as { fromOrderStage?: string | null }).fromOrderStage;
        const title =
          toStage != null ? `Stage → ${toStage}` : `Status → ${h.toStatus}`;
        return {
          id: h.id,
          type: "STATUS",
          at: h.createdAt,
          title,
          body: h.reason ?? null,
          meta: {
            from: fromStage ?? h.fromStatus,
            to: toStage ?? h.toStatus,
            changedBy: h.changedBy,
          },
        };
      }),
      ...activities.map((a) => ({
        id: a.id,
        type: "ACTIVITY",
        at: a.occurredAt ?? a.createdAt,
        title: a.title ?? a.type,
        body: a.body,
        meta: { activityType: a.type, createdBy: a.createdBy },
      })),
      ...ttns.map((t) => ({
        id: t.id,
        type: "TTN",
        at: t.createdAt,
        title: `TTN ${t.documentNumber}`,
        body: t.statusText ?? null,
        meta: { statusCode: t.statusCode, carrier: t.carrier, cost: t.cost },
      })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    return { items };
  }

  private async recalcAndReturn(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw new NotFoundException("Order not found");

    const subtotal = order.items.reduce((sum, it) => sum + (it.lineTotal ?? 0), 0);
    const a = this.calc(subtotal, order.discountAmount, order.paidAmount);
    const returnAdjustment = Math.max(0, Number(order.returnAdjustmentAmount ?? 0));
    const effectiveTotal = Math.max(0, a.total - returnAdjustment);
    const debtAmount = Math.max(0, effectiveTotal - a.paid);
    const financialStatus = computeFinancialStatusFromOrder({
      paymentType: order.paymentType,
      totalAmount: effectiveTotal,
      paidAmount: order.paidAmount,
      debtAmount,
      paymentDueDate: order.paymentDueDate,
      orderStage: order.orderStage ?? undefined,
    });

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        subtotalAmount: a.subtotal,
        totalAmount: a.total,
        debtAmount,
        financialStatus,
      },
      include: ORDER_INCLUDE,
    });

    return this.mapToEntity(updated);
  }

  private calcPaymentStatus(paidAmount: number, totalAmount: number): OrderPaymentStatus {
    const paid = Number(paidAmount) || 0;
    const total = Number(totalAmount) || 0;
    if (paid <= 0) return OrderPaymentStatus.UNPAID;
    if (paid >= total) return paid > total ? OrderPaymentStatus.OVERPAID : OrderPaymentStatus.PAID;
    return OrderPaymentStatus.PARTIALLY_PAID;
  }

  private mapToEntity(o: Record<string, unknown>) {
    const items = (o.items as Array<Record<string, unknown>> | undefined) ?? [];
    const paidAmount = Number(o.paidAmount) ?? 0;
    const totalAmount = Number(o.totalAmount) ?? 0;
    const parentOrder = o.parentOrder as { id: string; orderNumber: string } | null | undefined;
    const childOrders =
      (o.childOrders as Array<{ id: string; orderNumber: string; orderStage: string | null }> | undefined) ??
      [];

    return {
      id: o.id,
      orderNumber: o.orderNumber,
      orderSource: o.orderSource ?? null,
      parentOrderId: o.parentOrderId ?? null,
      parent: parentOrder ? { id: parentOrder.id, orderNumber: parentOrder.orderNumber } : null,
      children: childOrders.map((c) => ({
        id: c.id,
        orderNumber: c.orderNumber,
        orderStage: c.orderStage ?? null,
      })),
      companyId: o.companyId ?? null,
      clientId: o.clientId ?? null,
      contactId: o.contactId ?? null,
      ownerId: o.ownerId ?? null,
      status: o.status,
      currency: o.currency,
      subtotalAmount: o.subtotalAmount,
      discountAmount: o.discountAmount,
      totalAmount: o.totalAmount,
      paidAmount: o.paidAmount,
      debtAmount: o.debtAmount,
      paymentStatus: this.calcPaymentStatus(paidAmount, totalAmount),
      comment: o.comment ?? null,
      deliveryMethod: o.deliveryMethod ?? null,
      paymentMethod: o.paymentMethod ?? null,
      bankAccountId: o.bankAccountId ?? null,
      bankAccount: o.bankAccount ?? null,
      warehouseId: o.warehouseId ?? null,
      warehouse: o.warehouse ?? null,
      documentsRequested: o.documentsRequested ?? null,
      paymentType: o.paymentType ?? null,
      deliveryData: o.deliveryData ?? null,
      invoiceNumber: o.invoiceNumber ?? null,
      invoiceDate: o.invoiceDate ?? null,
      waybillNumber: o.waybillNumber ?? null,
      waybillDate: o.waybillDate ?? null,
      exchangeRate: o.exchangeRate ?? null,
      orderStage: o.orderStage ?? null,
      deliveryStatus: o.deliveryStatus ?? null,
      financialStatus: o.financialStatus ?? null,
      paymentDueDate: o.paymentDueDate ?? null,
      returnAdjustmentAmount: o.returnAdjustmentAmount ?? null,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
      company: o.company ?? null,
      client: o.client ?? null,
      contact: o.contact ?? null,
      items: items.map((it) => ({
        id: it.id,
        productId: it.productId,
        productName:
          (it.product as { name?: string } | null)?.name ??
          (it as { productNameSnapshot?: string | null }).productNameSnapshot ??
          "",
        qty: it.qty,
        price: it.price,
        discountPercent: it.discountPercent ?? 0,
        lineTotal: it.lineTotal,
        product: it.product ?? null,
      })),
      ttns: o.ttns ?? [],
      shipments: o.shipments ?? [],
    };
  }
}
