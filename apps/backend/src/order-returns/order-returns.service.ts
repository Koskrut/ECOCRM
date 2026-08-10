import { BadRequestException, ForbiddenException, forwardRef, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { OrderSource, OrderStage, Prisma, ReturnReason, ReturnStatus } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { IntegrationPortsService } from "../integration-ports/integration-ports.service";
import {
  computeFinancialStatusFromOrder,
  orderStageToDeliveryStatus,
} from "../orders/order-status-sync.mapper";
import { getOrderCompletionBlockers } from "../orders/order-completion-guards";
import { OrderMaterialReservationService } from "../orders/order-material-reservation.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateOrderReturnDto } from "./dto/create-order-return.dto";
import type { ListOrderReturnsQueryDto } from "./dto/list-order-returns-query.dto";
import type { WaiveMisPickChecklistDto, UpdateReturnItemsDto } from "./dto/mis-pick.dto";
import type { SettleReturnDto } from "../client-balances/dto/settle-return.dto";
import { computeReturnAdjustmentAmount } from "./order-return-adjustment.utils";
import { computeReturnCoverage } from "./order-return-coverage.utils";
import {
  getAllowedReturnStatusTransitions,
  isMisPickChecklistComplete,
  isMisPickReturn,
  misPickItemsNeedDisposition,
  shouldExcludeReturnFromOrderFinancialSync,
} from "./order-return-mis-pick.utils";
import {
  buildReplacementLinesFromReturnItems,
  createReplacementOrder,
  syncMisPickOutboundForReplacementOrder,
} from "./order-return-replacement.utils";
import {
  assertWarehouseReturnCreate,
  assertWarehouseReturnSettlement,
  assertWarehouseReturnStatusUpdate,
} from "./order-return-warehouse-role";
import { normalizeTtnNumber } from "./return-package-np-status.utils";
import { ReturnPackagesService } from "./return-packages.service";
import { resolveReturnWarehouseId } from "./return-warehouse.utils";

const CLOSED_RETURN_STATUS: ReturnStatus = "CLOSED";

const RETURN_ITEM_INCLUDE = {
  orderItem: {
    include: { product: { select: { id: true, name: true, sku: true } } },
  },
  actualProduct: { select: { id: true, name: true, sku: true } },
} as const;

const RETURN_DETAIL_INCLUDE = {
  order: {
    include: {
      company: { select: { id: true, name: true } },
      client: { select: { id: true, firstName: true, lastName: true } },
    },
  },
  items: { include: RETURN_ITEM_INCLUDE },
  returnPackage: true,
  replacementOrder: {
    select: { id: true, orderNumber: true, orderStage: true },
  },
  warehouse: { select: { id: true, name: true } },
} as const;

@Injectable()
export class OrderReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationPortsService,
    private readonly materialReservations: OrderMaterialReservationService,
    @Inject(forwardRef(() => ReturnPackagesService))
    private readonly returnPackages: ReturnPackagesService,
  ) {}

  async syncOrderStateFromReturns(orderId: string) {
    const [openCount, allReturns, orderSnapshot] = await Promise.all([
      this.prisma.orderReturn.count({
        where: { orderId, status: { not: CLOSED_RETURN_STATUS } },
      }),
      this.prisma.orderReturn.findMany({
        where: { orderId },
        include: { items: { include: { orderItem: true } } },
      }),
      this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
          subtotalAmount: true,
          totalAmount: true,
          orderStage: true,
          items: { select: { id: true, qty: true } },
        },
      }),
    ]);
    if (!orderSnapshot) throw new NotFoundException("Order not found");

    const coverage = computeReturnCoverage(
      orderSnapshot.items,
      allReturns
        .filter((r) => !shouldExcludeReturnFromOrderFinancialSync(r))
        .flatMap((r) =>
          r.items.map((ri) => ({
            orderItemId: ri.orderItemId,
            qtyReturned: ri.qtyReturned,
          })),
        ),
    );

    const totalAdjustment = computeReturnAdjustmentAmount(
      allReturns.filter((r) => !shouldExcludeReturnFromOrderFinancialSync(r)),
      {
        subtotalAmount: orderSnapshot.subtotalAmount ?? 0,
        totalAmount: orderSnapshot.totalAmount ?? 0,
      },
    );

    await this.prisma.order.update({
      where: { id: orderId },
      data: { returnAdjustmentAmount: totalAdjustment },
    });
    await this.integrations.recalcOrderFinance(orderId);

    const orderAfter = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        debtAmount: true,
        paymentType: true,
        totalAmount: true,
        paidAmount: true,
        returnAdjustmentAmount: true,
        paymentDueDate: true,
        subtotalAmount: true,
      },
    });
    if (!orderAfter) throw new NotFoundException("Order not found");

    const stageByDebt = (): OrderStage =>
      Number(orderAfter.debtAmount) <= 0.00001 ? "COMPLETED" : "RECEIVED";

    let nextStage: OrderStage;
    const hasActiveMisPickReplacement = allReturns.some(
      (r) =>
        r.status !== CLOSED_RETURN_STATUS &&
        shouldExcludeReturnFromOrderFinancialSync(r),
    );

    if (openCount > 0) {
      if (coverage === "FULL" && !hasActiveMisPickReplacement) {
        nextStage = "RETURN_IN_PROGRESS";
      } else {
        const current = orderSnapshot.orderStage;
        nextStage =
          current === "RECEIVED" || current === "COMPLETED" ? current : stageByDebt();
      }
    } else if (coverage === "FULL" && !hasActiveMisPickReplacement) {
      nextStage = "FULLY_RETURNED";
    } else {
      const completionBlockers = await getOrderCompletionBlockers(this.prisma, orderId, {
        paymentType: orderAfter.paymentType,
        paidAmount: orderAfter.paidAmount,
        totalAmount: orderAfter.totalAmount,
        subtotalAmount: orderAfter.subtotalAmount ?? 0,
        debtAmount: orderAfter.debtAmount,
        returnAdjustmentAmount: orderAfter.returnAdjustmentAmount,
        paymentDueDate: orderAfter.paymentDueDate,
      });
      nextStage = completionBlockers.length === 0 ? "COMPLETED" : "RECEIVED";
    }

    const effectiveTotal = Math.max(
      0,
      Number(orderAfter.totalAmount ?? 0) - Number(orderAfter.returnAdjustmentAmount ?? 0),
    );
    const deliveryStatus = orderStageToDeliveryStatus(nextStage);
    const financialStatus = computeFinancialStatusFromOrder({
      paymentType: orderAfter.paymentType,
      totalAmount: effectiveTotal,
      paidAmount: Number(orderAfter.paidAmount),
      debtAmount: Number(orderAfter.debtAmount),
      paymentDueDate: orderAfter.paymentDueDate ?? undefined,
      orderStage: nextStage,
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        orderStage: nextStage,
        deliveryStatus,
        financialStatus,
      },
    });
    await this.materialReservations.applyReservationPolicy(orderId, nextStage);
  }

  private assertAccess(order: { ownerId: string | null }, actor?: AuthUser) {
    if (!actor) return;
    if (actor.role === UserRole.MANAGER && order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access returns for orders assigned to you");
    }
  }

  async create(orderId: string, dto: CreateOrderReturnDto, actor?: AuthUser) {
    assertWarehouseReturnCreate(actor);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        company: true,
        client: true,
      },
    });
    if (!order) throw new NotFoundException("Order not found");
    this.assertAccess(order, actor);

    const currentStage = order.orderStage ?? undefined;
    const canCreateReturn =
      currentStage === "RECEIVED" ||
      currentStage === "COMPLETED" ||
      currentStage === "RETURN_IN_PROGRESS";
    if (!canCreateReturn) {
      throw new BadRequestException(
        "Return can only be created for orders in RECEIVED, COMPLETED or RETURN_IN_PROGRESS stage",
      );
    }

    const itemsPending = dto.itemsPending === true;
    const hasItems = (dto.items?.length ?? 0) > 0;
    const ttnNumber = dto.ttnNumber ? normalizeTtnNumber(dto.ttnNumber) : undefined;

    if (itemsPending && hasItems) {
      throw new BadRequestException("Cannot provide items when itemsPending is true");
    }
    if (!itemsPending && !hasItems) {
      throw new BadRequestException("At least one item is required unless itemsPending is set");
    }

    let returnItems: { orderItemId: string; qtyReturned: number; actualProductId?: string }[] = [];
    if (hasItems) {
      const orderItemIds = new Map(order.items.map((i) => [i.id, i]));
      const merged = new Map<string, { qtyReturned: number; actualProductId?: string }>();
      for (const it of dto.items!) {
        const oi = orderItemIds.get(it.orderItemId);
        if (!oi) {
          throw new BadRequestException(`Order item ${it.orderItemId} not found in order`);
        }
        const qty = Math.min(Math.max(1, Math.floor(it.qtyReturned)), oi.qty);
        const prev = merged.get(oi.id);
        merged.set(oi.id, {
          qtyReturned: Math.min((prev?.qtyReturned ?? 0) + qty, oi.qty),
          actualProductId: it.actualProductId ?? prev?.actualProductId,
        });
      }
      returnItems = Array.from(merged.entries()).map(([orderItemId, v]) => ({
        orderItemId,
        qtyReturned: v.qtyReturned,
        actualProductId: v.actualProductId,
      }));

      const alreadyReturned = await this.prisma.orderReturnItem.groupBy({
        by: ["orderItemId"],
        where: {
          orderItemId: { in: returnItems.map((it) => it.orderItemId) },
          orderReturn: { orderId },
        },
        _sum: { qtyReturned: true },
      });
      const returnedByItem = new Map<string, number>(
        alreadyReturned.map((row) => [row.orderItemId, row._sum.qtyReturned ?? 0]),
      );
      for (const item of returnItems) {
        const orderItem = orderItemIds.get(item.orderItemId)!;
        const totalReturned = (returnedByItem.get(item.orderItemId) ?? 0) + item.qtyReturned;
        if (totalReturned > orderItem.qty) {
          throw new BadRequestException(
            `Return quantity exceeds purchased quantity for item ${item.orderItemId}: ${totalReturned} > ${orderItem.qty}`,
          );
        }
      }
    }

    const reason: ReturnReason = dto.reason ?? "CUSTOMER_CHANGE";
    if (reason === "WRONG_ITEM") {
      if (itemsPending) {
        throw new BadRequestException("Mis-pick returns cannot use warehouse-pending items mode");
      }
      if (!dto.replacementMode) {
        throw new BadRequestException("Replacement mode is required for mis-pick returns");
      }
      if (returnItems.length === 0) {
        throw new BadRequestException("At least one item is required for mis-pick returns");
      }
      for (const item of returnItems) {
        if (!item.actualProductId) {
          throw new BadRequestException(
            "Actual product is required for each line in a mis-pick return",
          );
        }
      }
    } else if (dto.replacementMode) {
      throw new BadRequestException("Replacement mode is only allowed for mis-pick returns");
    }

    const initialStatus: ReturnStatus =
      ttnNumber && (itemsPending || returnItems.length === 0)
        ? "IN_TRANSIT_BACK"
        : "REQUESTED";

    const changedBy = actor?.id ?? "system";
    const returnWarehouseId = await resolveReturnWarehouseId(this.prisma, {
      warehouseId: dto.warehouseId,
      orderId,
    });

    const created = await this.prisma.$transaction(async (tx) => {
      let returnPackageId: string | undefined;
      if (ttnNumber) {
        const pkg = await this.returnPackages.findOrCreatePackageByTtn(
          ttnNumber,
          {
            contactId: order.clientId ?? order.contactId ?? undefined,
            warehouseId: returnWarehouseId,
          },
          tx,
        );
        returnPackageId = pkg.id;
      }

      let replacementOrderId: string | undefined;
      if (reason === "WRONG_ITEM" && dto.replacementMode === "REPLACE_FIRST") {
        replacementOrderId = await this.createReplacementOrderForReturn(
          tx,
          order,
          returnItems,
          changedBy,
        );
      }

      const createdReturn = await tx.orderReturn.create({
        data: {
          orderId,
          status: initialStatus,
          reason,
          replacementMode: reason === "WRONG_ITEM" ? dto.replacementMode : null,
          replacementOrderId,
          itemsPending,
          returnPackageId,
          warehouseId: returnWarehouseId,
          ...(returnItems.length
            ? {
                items: {
                  create: returnItems.map((r) => ({
                    orderItemId: r.orderItemId,
                    qtyReturned: r.qtyReturned,
                    actualProductId: r.actualProductId,
                  })),
                },
              }
            : {}),
        },
        include: {
          items: { include: RETURN_ITEM_INCLUDE },
          order: { select: { id: true, orderNumber: true } },
          returnPackage: true,
          replacementOrder: {
            select: { id: true, orderNumber: true, orderStage: true },
          },
        },
      });

      if (returnPackageId) {
        await this.returnPackages.syncLinkedReturnsLogistics(returnPackageId, "IN_TRANSIT_BACK", tx);
      }

      return createdReturn;
    });

    await this.syncOrderStateFromReturns(orderId);

    return created;
  }

  async list(q: ListOrderReturnsQueryDto, actor?: AuthUser) {
    const page = Math.max(1, q?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q?.pageSize ?? 50));
    const where: Prisma.OrderReturnWhereInput = {};
    if (q?.orderId) where.orderId = q.orderId;
    if (q?.status) where.status = q.status;
    if (actor?.role === UserRole.MANAGER) {
      where.order = { ownerId: actor.id };
    }

    const [items, total] = await Promise.all([
      this.prisma.orderReturn.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          order: {
            select: {
              id: true,
              orderNumber: true,
              orderStage: true,
              totalAmount: true,
              debtAmount: true,
              paidAmount: true,
              currency: true,
              company: { select: { id: true, name: true } },
              client: { select: { id: true, firstName: true, lastName: true } },
            },
          },
          items: { include: RETURN_ITEM_INCLUDE },
          returnPackage: {
            select: {
              id: true,
              ttnNumber: true,
              status: true,
              ttnStatusCode: true,
              ttnStatusText: true,
            },
          },
          replacementOrder: {
            select: { id: true, orderNumber: true, orderStage: true },
          },
        },
      }),
      this.prisma.orderReturn.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async listByOrderId(orderId: string, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, ownerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    this.assertAccess(order, actor);

    const items = await this.prisma.orderReturn.findMany({
      where: { orderId },
      orderBy: { createdAt: "desc" },
      include: {
        items: { include: RETURN_ITEM_INCLUDE },
        returnPackage: {
          select: {
            id: true,
            ttnNumber: true,
            status: true,
            ttnStatusCode: true,
            ttnStatusText: true,
          },
        },
        replacementOrder: {
          select: { id: true, orderNumber: true, orderStage: true },
        },
      },
    });
    return { items };
  }

  async getById(id: string, actor?: AuthUser) {
    const r = await this.prisma.orderReturn.findUnique({
      where: { id },
      include: RETURN_DETAIL_INCLUDE,
    });
    if (!r) throw new NotFoundException("Return not found");
    this.assertAccess(r.order, actor);
    await this.recomputeMisPickOutboundIfNeeded(r);
    return (
      (await this.prisma.orderReturn.findUnique({
        where: { id },
        include: RETURN_DETAIL_INCLUDE,
      })) ?? r
    );
  }

  async updateStatus(
    id: string,
    status: ReturnStatus,
    actor?: AuthUser,
    settlement?: SettleReturnDto,
  ) {
    const r = await this.prisma.orderReturn.findUnique({
      where: { id },
      include: {
        order: true,
        items: { include: { orderItem: true } },
      },
    });
    if (!r) throw new NotFoundException("Return not found");
    this.assertAccess(r.order, actor);

    assertWarehouseReturnStatusUpdate(actor, status);
    if (settlement) assertWarehouseReturnSettlement(actor);

    if (status === CLOSED_RETURN_STATUS) {
      if (r.itemsPending || r.items.length === 0) {
        throw new BadRequestException("Cannot close a return without item breakdown");
      }
      if (isMisPickReturn(r.reason) && !isMisPickChecklistComplete(r)) {
        throw new BadRequestException(
          "Cannot close mis-pick return until wrong-item return and replacement shipment are complete",
        );
      }
    }

    const allowed = getAllowedReturnStatusTransitions(r.status, r);
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Transition from ${r.status} to ${status} is not allowed`,
      );
    }

    if (
      status === "REFUND_OR_ADJUSTMENT" &&
      isMisPickReturn(r.reason) &&
      !r.outboundWaivedAt
    ) {
      throw new BadRequestException(
        "Refund step is only available when replacement shipment is waived",
      );
    }

    const updates: { status: ReturnStatus; closedAt?: Date } = { status };
    if (status === CLOSED_RETURN_STATUS) updates.closedAt = new Date();

    const updated = await this.prisma.orderReturn.update({
      where: { id },
      data: updates,
      include: RETURN_DETAIL_INCLUDE,
    });

    await this.syncOrderStateFromReturns(r.orderId);

    if (status === CLOSED_RETURN_STATUS) {
      let preview: { requiresSettlement?: boolean; maxSettleAmount?: number; alreadySettled?: boolean };
      const skipSettlement =
        isMisPickReturn(r.reason) && !r.outboundWaivedAt && isMisPickChecklistComplete(r);
      try {
        preview = skipSettlement
          ? { requiresSettlement: false }
          : ((await this.integrations.getReturnSettlementPreview(id, actor)) as typeof preview);
      } catch {
        preview = { requiresSettlement: false };
      }

      if (preview.requiresSettlement && !preview.alreadySettled) {
        if (!settlement) {
          throw new BadRequestException(
            `Return closure created overpayment (max ${preview.maxSettleAmount ?? 0}). Provide settlement (credit/refund).`,
          );
        }
        await this.integrations.settleReturn(id, settlement, actor);
      } else if (settlement) {
        await this.integrations.settleReturn(id, settlement, actor);
      }
    }

    return this.prisma.orderReturn.findUnique({
      where: { id },
      include: RETURN_DETAIL_INCLUDE,
    }) ?? updated;
  }

  async updateReturnItems(id: string, dto: UpdateReturnItemsDto, actor?: AuthUser) {
    assertWarehouseReturnCreate(actor);

    const r = await this.prisma.orderReturn.findUnique({
      where: { id },
      include: { order: true, items: true },
    });
    if (!r) throw new NotFoundException("Return not found");
    this.assertAccess(r.order, actor);
    if (!isMisPickReturn(r.reason)) {
      throw new BadRequestException("Item disposition updates apply only to mis-pick returns");
    }

    const itemIds = new Set(r.items.map((it) => it.id));
    for (const patch of dto.items) {
      if (!itemIds.has(patch.returnItemId)) {
        throw new BadRequestException(`Return item ${patch.returnItemId} not found`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const patch of dto.items) {
        await tx.orderReturnItem.update({
          where: { id: patch.returnItemId },
          data: {
            disposition: patch.disposition,
            ...(patch.actualProductId !== undefined
              ? { actualProductId: patch.actualProductId || null }
              : {}),
          },
        });
      }
    });

    return this.getById(id, actor);
  }

  async waiveChecklist(id: string, dto: WaiveMisPickChecklistDto, actor?: AuthUser) {
    if (actor?.role === UserRole.WAREHOUSE) {
      throw new ForbiddenException("Only managers can waive mis-pick checklist items");
    }

    const r = await this.prisma.orderReturn.findUnique({
      where: { id },
      include: { order: true },
    });
    if (!r) throw new NotFoundException("Return not found");
    this.assertAccess(r.order, actor);
    if (!isMisPickReturn(r.reason)) {
      throw new BadRequestException("Waive applies only to mis-pick returns");
    }

    const now = new Date();
    const data =
      dto.leg === "inbound"
        ? { inboundWaivedAt: now, inboundWaiveReason: dto.reason.trim() }
        : { outboundWaivedAt: now, outboundWaiveReason: dto.reason.trim() };

    await this.prisma.orderReturn.update({ where: { id }, data });
    await this.syncOrderStateFromReturns(r.orderId);
    return this.getById(id, actor);
  }

  async finalizeMisPickInbound(returnId: string, tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma;
    const ret = await db.orderReturn.findUnique({
      where: { id: returnId },
      include: {
        items: true,
        order: { include: { items: true } },
      },
    });
    if (!ret || !isMisPickReturn(ret.reason)) return;

    if (misPickItemsNeedDisposition(ret)) {
      throw new BadRequestException(
        "Set disposition for all mis-pick lines before completing inspection",
      );
    }

    await db.orderReturn.update({
      where: { id: returnId },
      data: { inboundDoneAt: new Date() },
    });

    if (ret.replacementMode === "RETURN_FIRST" && !ret.replacementOrderId) {
      const replacementOrderId = await this.createReplacementOrderForReturn(
        db,
        ret.order,
        ret.items.map((it) => ({
          orderItemId: it.orderItemId,
          qtyReturned: it.qtyReturned,
        })),
        "system",
      );
      await db.orderReturn.update({
        where: { id: returnId },
        data: { replacementOrderId },
      });
    }
  }

  async syncMisPickOutboundForReplacementOrder(orderId: string, orderStage: OrderStage | null) {
    await syncMisPickOutboundForReplacementOrder(this.prisma, orderId, orderStage);
  }

  private async recomputeMisPickOutboundIfNeeded(ret: {
    id: string;
    replacementOrderId: string | null;
    outboundDoneAt: Date | null;
    outboundWaivedAt: Date | null;
    replacementOrder?: { orderStage: OrderStage | null } | null;
  }) {
    if (!ret.replacementOrderId || ret.outboundDoneAt || ret.outboundWaivedAt) return;
    const stage = ret.replacementOrder?.orderStage;
    if (!stage) return;
    await syncMisPickOutboundForReplacementOrder(this.prisma, ret.replacementOrderId, stage);
  }

  private async createReplacementOrderForReturn(
    tx: Prisma.TransactionClient,
    order: {
      id: string;
      orderNumber: string;
      ownerId: string;
      companyId: string | null;
      clientId: string | null;
      contactId: string | null;
      orderSource: OrderSource;
      currency: string;
      deliveryMethod: string | null;
      paymentMethod: string | null;
      bankAccountId: string | null;
      warehouseId: string | null;
      documentsRequested: boolean | null;
      paymentType: string | null;
      paymentDueDate: Date | null;
      exchangeRate: number | null;
      discountAmount: number;
      items: Array<{
        id: string;
        productId: string | null;
        productNameSnapshot: string | null;
        qty: number;
        price: number;
        discountPercent: number;
      }>;
    },
    returnItems: Array<{ orderItemId: string; qtyReturned: number }>,
    changedBy: string,
  ): Promise<string> {
    const lines = buildReplacementLinesFromReturnItems(order, returnItems);
    return createReplacementOrder(tx, order, lines, changedBy);
  }

  getSettlementPreview(id: string, actor?: AuthUser) {
    return this.integrations.getReturnSettlementPreview(id, actor);
  }
}
