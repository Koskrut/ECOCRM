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
  OrderPaymentStatus,
  OrderSource,
  OrderStatus,
  UserRole,
} from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { GoogleSheetSendOrderService } from "../integrations/google-sheet/google-sheet-send-order.service";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { WarehousesService } from "../warehouses/warehouses.service";
import type { AddOrderItemDto } from "./dto/add-order-item.dto";
import type { CreateOrderDto } from "./dto/create-order.dto";
import type { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import type { UpdateOrderDto } from "./dto/update-order.dto";
import {
  computeFinancialStatusFromOrder,
  legacyStatusToOrderStage,
  orderStageToDeliveryStatus,
  orderStageToLegacyStatus,
} from "./order-status-sync.mapper";
import { validateOrderStageTransition } from "./order-stage-transitions";
import { OrdersPipelineConfigService } from "./pipeline/orders-pipeline-config.service";

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly warehousesService: WarehousesService,
    private readonly settings: SettingsService,
    private readonly googleSheetSendOrder: GoogleSheetSendOrderService,
    private readonly ordersPipelineConfig: OrdersPipelineConfigService,
  ) {}

  private num(v: unknown, fallback = 0) {
    const n = typeof v === "string" ? Number(v) : (v as number);
    return Number.isFinite(n) ? n : fallback;
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
   * For the given order IDs, marks each order true if any of its TTNs uses a document number
   * that is also linked to a different order (directly or via shipment).
   */
  private async computeTtnSharedAcrossOrdersFlags(orderIds: string[]): Promise<Map<string, boolean>> {
    const out = new Map<string, boolean>();
    for (const id of orderIds) out.set(id, false);
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
      if (sharedNorms.has(norm)) out.set(oid, true);
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
    if (q?.orderStage) where.orderStage = q.orderStage as OrderStage;
    if (q?.financialStatus) where.financialStatus = q.financialStatus as OrderFinancialStatus;
    if (q?.overdue === true) andWhere.push({ financialStatus: "OVERDUE" });
    if (q?.dueSoon === true) andWhere.push({ financialStatus: "DUE_SOON" });
    if (q?.hasDebt === true) andWhere.push({ debtAmount: { gt: 0 } });
    if (q?.hasDueDate === true) andWhere.push({ paymentDueDate: { not: null } });
    if (q?.ownerId) where.ownerId = String(q.ownerId);
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
      andWhere.push({
        OR: [
          { orderNumber: { contains: search, mode: "insensitive" } },
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

    const pageOrderIds = items.map((o) => o.id);
    const ttnSharedFlags = await this.computeTtnSharedAcrossOrdersFlags(pageOrderIds);

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
          financialStatus: o.financialStatus ?? null,
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
          hasTtn: (o._count?.ttns ?? 0) > 0,
          ttnSharedAcrossOrders: ttnSharedFlags.get(o.id) === true,
          createdAt: o.createdAt,
          itemsCount: o.items.length,
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
    const ttnSharedFlags = await this.computeTtnSharedAcrossOrdersFlags([id]);
    return {
      ...this.mapToEntity(o),
      ttnSharedAcrossOrders: ttnSharedFlags.get(id) === true,
    };
  }

  async create(dto: CreateOrderDto, actor?: AuthUser) {
    // When authenticated, use current user as owner; otherwise require body (e.g. API).
    const ownerId = actor?.id ?? dto.ownerId ?? undefined;
    if (!ownerId) throw new BadRequestException("ownerId is required");
    const orderSource = dto.orderSource ?? OrderSource.CRM;
    const currency = "USD";
    const discountAmount = this.num(dto.discountAmount, 0);
    const paidAmount = 0;
    const a = this.calc(0, discountAmount, paidAmount);

    const warehouseId =
      dto.warehouseId ?? (await this.warehousesService.getDefaultWarehouseId());
    let exchangeRate: number | null = null;
    try {
      const rates = await this.settings.getExchangeRates();
      exchangeRate = rates.UAH_TO_USD > 0 ? 1 / rates.UAH_TO_USD : 41;
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

      return this.mapToEntity(order);
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
    return this.mapToEntity(updated);
  }

  async addItem(orderId: string, dto: AddOrderItemDto, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, ownerId: true, currency: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(order, actor);

    const productId = dto.productId;
    const qty = Math.max(1, Math.trunc(dto.qty));
    const price = dto.price;

    const existing = await this.prisma.orderItem.findUnique({
      where: { orderId_productId: { orderId, productId } },
    });

    if (existing) {
      await this.prisma.orderItem.update({
        where: { id: existing.id },
        data: {
          qty: existing.qty + qty,
          price,
          lineTotal: (existing.qty + qty) * price,
        },
      });
    } else {
      await this.prisma.orderItem.create({
        data: {
          orderId,
          productId,
          qty,
          price,
          lineTotal: qty * price,
        },
      });
    }

    return this.recalcAndReturn(orderId);
  }

  async updateItem(
    orderId: string,
    itemId: string,
    dto: { qty?: number; price?: number },
    actor?: AuthUser,
  ) {
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

    const nextQty = dto.qty != null ? Math.max(1, Math.trunc(dto.qty)) : item.qty;
    const nextPrice = dto.price != null ? dto.price : item.price;

    await this.prisma.orderItem.update({
      where: { id: itemId },
      data: {
        qty: nextQty,
        price: nextPrice,
        lineTotal: nextQty * nextPrice,
      },
    });

    return this.recalcAndReturn(orderId);
  }

  async removeItem(orderId: string, itemId: string, actor?: AuthUser) {
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
    return this.recalcAndReturn(orderId);
  }

  /**
   * Move shortage quantities to a new child order (parentOrderId). Payments stay on the parent (MVP).
   * Stock: warehouse row if order.warehouseId and row exists, else Product.stock.
   */
  async splitByStock(orderId: string, actor?: AuthUser) {
    const parent = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!parent) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(parent, actor);

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

    type Plan = {
      itemId: string;
      productId: string | null;
      keepQty: number;
      moveQty: number;
      price: number;
      snapshot: string | null;
    };

    const plans: Plan[] = [];
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
        snapshot: it.productNameSnapshot,
      });
    }

    const totalMove = plans.reduce((s, p) => s + p.moveQty, 0);
    if (totalMove <= 0) {
      throw new BadRequestException("Nothing to split: stock covers all lines");
    }

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
        orderStage: "NEW",
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
          comment: `Частина замовлення з №${parent.orderNumber}`,
          deliveryMethod: parent.deliveryMethod,
          paymentMethod: parent.paymentMethod,
          bankAccountId: parent.bankAccountId,
          warehouseId: parent.warehouseId,
          documentsRequested: parent.documentsRequested,
          paymentType: parent.paymentType,
          paymentDueDate: parent.paymentDueDate,
          exchangeRate: parent.exchangeRate,
          orderStage: "NEW",
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
          await tx.orderItem.update({
            where: { id: existingChildLine.id },
            data: {
              qty: nq,
              lineTotal: nq * existingChildLine.price,
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
              lineTotal: p.moveQty * p.price,
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
              lineTotal: p.keepQty * p.price,
            },
          });
        }
      }

      await tx.activity.create({
        data: {
          type: ActivityType.COMMENT,
          title: "Розділення по залишках",
          body: `Створено дочірнє замовлення №${orderNumber} (нестача на складі). Оплати залишились на цьому замовленні.`,
          createdBy: changedBy,
          orderId: parent.id,
        },
      });
      await tx.activity.create({
        data: {
          type: ActivityType.COMMENT,
          title: "Розділення по залишках",
          body: `Виділено з батьківського замовлення №${parent.orderNumber}.`,
          createdBy: changedBy,
          orderId: child.id,
        },
      });

      return child.id;
    });

    await this.recalcAndReturn(orderId);
    await this.recalcAndReturn(childId);

    const [parentEntity, childEntity] = await Promise.all([
      this.getById(orderId, actor),
      this.getById(childId, actor),
    ]);
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
        orderStage: true,
        status: true,
        paymentType: true,
        paidAmount: true,
        totalAmount: true,
        debtAmount: true,
        paymentDueDate: true,
      },
    });
    if (!current) throw new NotFoundException("Order not found");
    if (actor) this.assertOrderAccess(current, actor);

    const transitionGraph = await this.ordersPipelineConfig.getEffectiveTransitionGraph();
    validateOrderStageTransition(current.orderStage, toStage, {
      orderStage: current.orderStage,
      paymentType: current.paymentType,
      paidAmount: current.paidAmount,
      totalAmount: current.totalAmount,
      debtAmount: current.debtAmount,
    }, transitionGraph);

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

    if (toStage === "READY_TO_SHIP") {
      this.settings.getGoogleSheetSecrets().then(({ sendOnReadyToShip }) => {
        if (sendOnReadyToShip) {
          this.googleSheetSendOrder.sendOrderToSheet(id, { exportDate: new Date() }).catch((err) => {
            if (err instanceof Error) this.logger.error(`Send to sheet failed: ${err.message}`);
          });
        }
      });
    }

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
    const financialStatus = computeFinancialStatusFromOrder({
      paymentType: order.paymentType,
      totalAmount: a.total,
      paidAmount: order.paidAmount,
      debtAmount: a.debt,
      paymentDueDate: order.paymentDueDate,
      orderStage: order.orderStage ?? undefined,
    });

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        subtotalAmount: a.subtotal,
        totalAmount: a.total,
        debtAmount: a.debt,
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
        lineTotal: it.lineTotal,
        product: it.product ?? null,
      })),
      ttns: o.ttns ?? [],
      shipments: o.shipments ?? [],
    };
  }
}
