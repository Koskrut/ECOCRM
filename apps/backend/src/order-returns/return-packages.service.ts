import {
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { OrderStage, Prisma, ReturnPackageStatus, ReturnStatus } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateOrderReturnItemDto } from "./dto/create-order-return.dto";
import type {
  AddReturnPackageItemsDto,
  CreateReturnPackageDto,
  ListReturnPackagesQueryDto,
} from "./dto/return-package.dto";
import {
  assertManagerPackageCreate,
  assertWarehousePackageItems,
  assertWarehousePackageReceive,
  isWarehouseRole,
} from "./order-return-warehouse-role";
import { NpClient } from "../np/np-client.service";
import {
  isInboundReturnReceivedByNpStatus,
  normalizeTtnNumber,
} from "./return-package-np-status.utils";
import { OrderReturnsService } from "./order-returns.service";

const WAREHOUSE_QUEUE_STATUSES: ReturnPackageStatus[] = [
  "IN_TRANSIT_BACK",
  "RECEIVED_BY_WAREHOUSE",
];

const RETURN_CREATE_STAGES: OrderStage[] = [
  "RECEIVED",
  "COMPLETED",
  "RETURN_IN_PROGRESS",
];

@Injectable()
export class ReturnPackagesService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => OrderReturnsService))
    private readonly orderReturns: OrderReturnsService,
    private readonly np: NpClient,
  ) {}

  private assertAccess(order: { ownerId: string | null }, actor?: AuthUser) {
    if (!actor) return;
    if (actor.role === UserRole.MANAGER && order.ownerId !== actor.id) {
      throw new ForbiddenException("You can only access returns for orders assigned to you");
    }
  }

  private async ensureOrderCanReturn(orderId: string, actor?: AuthUser) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    this.assertAccess(order, actor);

    const currentStage = order.orderStage ?? undefined;
    if (!currentStage || !RETURN_CREATE_STAGES.includes(currentStage)) {
      throw new BadRequestException(
        "Return can only be created for orders in RECEIVED, COMPLETED or RETURN_IN_PROGRESS stage",
      );
    }
    return order;
  }

  private async validateReturnItems(
    orderId: string,
    items: CreateOrderReturnItemDto[],
    excludeReturnId?: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException("Order not found");

    const orderItemIds = new Map(order.items.map((i) => [i.id, i]));
    const merged = new Map<string, number>();
    for (const it of items) {
      const oi = orderItemIds.get(it.orderItemId);
      if (!oi) {
        throw new BadRequestException(`Order item ${it.orderItemId} not found in order`);
      }
      const qty = Math.min(Math.max(1, Math.floor(it.qtyReturned)), oi.qty);
      merged.set(oi.id, Math.min((merged.get(oi.id) ?? 0) + qty, oi.qty));
    }
    const returnItems = Array.from(merged.entries()).map(([orderItemId, qtyReturned]) => ({
      orderItemId,
      qtyReturned,
    }));

    const alreadyReturned = await this.prisma.orderReturnItem.groupBy({
      by: ["orderItemId"],
      where: {
        orderItemId: { in: returnItems.map((it) => it.orderItemId) },
        orderReturn: {
          orderId,
          ...(excludeReturnId ? { id: { not: excludeReturnId } } : {}),
        },
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
    return returnItems;
  }

  async findOrCreatePackageByTtn(
    ttnNumber: string,
    opts?: { contactId?: string; note?: string },
    tx?: Prisma.TransactionClient,
  ) {
    const normalized = normalizeTtnNumber(ttnNumber);
    if (normalized.length < 4) {
      throw new BadRequestException("TTN number is too short");
    }
    const db = tx ?? this.prisma;
    const existing = await db.returnPackage.findUnique({ where: { ttnNumber: normalized } });
    if (existing) return existing;
    return db.returnPackage.create({
      data: {
        ttnNumber: normalized,
        contactId: opts?.contactId,
        note: opts?.note,
        status: "IN_TRANSIT_BACK",
      },
    });
  }

  async syncLinkedReturnsLogistics(
    packageId: string,
    target: ReturnPackageStatus,
    tx?: Prisma.TransactionClient,
  ) {
    const db = tx ?? this.prisma;
    const pkg = await db.returnPackage.findUnique({
      where: { id: packageId },
      include: { returns: true },
    });
    if (!pkg) throw new NotFoundException("Return package not found");

    await db.returnPackage.update({
      where: { id: packageId },
      data: { status: target },
    });

    const targetReturnStatus: ReturnStatus =
      target === "RECEIVED_BY_WAREHOUSE" ? "RECEIVED_BY_WAREHOUSE" : "IN_TRANSIT_BACK";

    for (const ret of pkg.returns) {
      if (ret.status === "CLOSED") continue;
      let next = ret.status;
      if (targetReturnStatus === "IN_TRANSIT_BACK") {
        if (next === "REQUESTED") next = "APPROVED";
        if (next === "APPROVED") next = "IN_TRANSIT_BACK";
      } else if (targetReturnStatus === "RECEIVED_BY_WAREHOUSE" && next === "IN_TRANSIT_BACK") {
        next = "RECEIVED_BY_WAREHOUSE";
      }
      if (next !== ret.status) {
        await db.orderReturn.update({
          where: { id: ret.id },
          data: { status: next },
        });
      }
    }

    const orderIds = [...new Set(pkg.returns.map((r) => r.orderId))];
    for (const orderId of orderIds) {
      await this.orderReturns.syncOrderStateFromReturns(orderId);
    }
  }

  async create(dto: CreateReturnPackageDto, actor?: AuthUser) {
    assertManagerPackageCreate(actor);

    const ttnNumber = normalizeTtnNumber(dto.ttnNumber);
    const hasItems = (dto.items?.length ?? 0) > 0;
    const itemsPending = dto.itemsPending ?? (!hasItems && !!dto.orderId);

    if (hasItems && itemsPending) {
      throw new BadRequestException("Cannot set itemsPending when items are provided");
    }
    if (dto.orderId) {
      await this.ensureOrderCanReturn(dto.orderId, actor);
    }
    if (hasItems && !dto.orderId) {
      throw new BadRequestException("orderId is required when items are provided");
    }

    let returnItems: { orderItemId: string; qtyReturned: number }[] = [];
    if (hasItems && dto.orderId) {
      returnItems = await this.validateReturnItems(dto.orderId, dto.items!);
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const pkg = await this.findOrCreatePackageByTtn(
        ttnNumber,
        { contactId: dto.contactId, note: dto.note },
        tx,
      );

      if (dto.contactId && !pkg.contactId) {
        await tx.returnPackage.update({
          where: { id: pkg.id },
          data: { contactId: dto.contactId },
        });
      }

      let orderReturn = null;
      if (dto.orderId) {
        const initialStatus: ReturnStatus = itemsPending || returnItems.length === 0
          ? "IN_TRANSIT_BACK"
          : "REQUESTED";

        orderReturn = await tx.orderReturn.create({
          data: {
            orderId: dto.orderId,
            returnPackageId: pkg.id,
            itemsPending,
            status: initialStatus,
            ...(returnItems.length
              ? {
                  items: {
                    create: returnItems.map((r) => ({
                      orderItemId: r.orderItemId,
                      qtyReturned: r.qtyReturned,
                    })),
                  },
                }
              : {}),
          },
          include: {
            items: { include: { orderItem: true } },
            order: { select: { id: true, orderNumber: true } },
          },
        });
      }

      if (dto.returnIds?.length) {
        for (const returnId of dto.returnIds) {
          const existing = await tx.orderReturn.findUnique({ where: { id: returnId } });
          if (!existing) throw new NotFoundException(`Return ${returnId} not found`);
          if (existing.returnPackageId && existing.returnPackageId !== pkg.id) {
            throw new BadRequestException(`Return ${returnId} is already linked to another package`);
          }
          await tx.orderReturn.update({
            where: { id: returnId },
            data: { returnPackageId: pkg.id },
          });
        }
      }

      await this.syncLinkedReturnsLogistics(pkg.id, "IN_TRANSIT_BACK", tx);

      return tx.returnPackage.findUnique({
        where: { id: pkg.id },
        include: {
          contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
          returns: {
            include: {
              items: { include: { orderItem: true } },
              order: {
                select: {
                  id: true,
                  orderNumber: true,
                  orderStage: true,
                  client: { select: { id: true, firstName: true, lastName: true } },
                  company: { select: { id: true, name: true } },
                },
              },
            },
          },
        },
      });
    });

    if (dto.orderId) {
      await this.orderReturns.syncOrderStateFromReturns(dto.orderId);
    }

    return created;
  }

  async updateTtn(id: string, ttnNumber: string, actor?: AuthUser) {
    assertManagerPackageCreate(actor);
    const normalized = normalizeTtnNumber(ttnNumber);
    const pkg = await this.prisma.returnPackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException("Return package not found");

    const conflict = await this.prisma.returnPackage.findUnique({ where: { ttnNumber: normalized } });
    if (conflict && conflict.id !== id) {
      throw new BadRequestException("TTN is already used by another return package");
    }

    return this.prisma.returnPackage.update({
      where: { id },
      data: { ttnNumber: normalized },
    });
  }

  async list(q: ListReturnPackagesQueryDto, actor?: AuthUser) {
    const page = Math.max(1, q?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q?.pageSize ?? 50));
    const where: Prisma.ReturnPackageWhereInput = {};

    if (q?.ttn) {
      where.ttnNumber = { contains: normalizeTtnNumber(q.ttn) };
    }
    if (q?.contactId) where.contactId = q.contactId;
    if (actor?.role === UserRole.MANAGER) {
      where.returns = { some: { order: { ownerId: actor.id } } };
    }

    const [items, total] = await Promise.all([
      this.prisma.returnPackage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: this.packageInclude(),
      }),
      this.prisma.returnPackage.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async listWarehouseQueue(actor?: AuthUser) {
    if (actor && actor.role !== UserRole.WAREHOUSE && actor.role !== UserRole.ADMIN) {
      // allow managers/admins to preview; warehouse primary user
    }

    const items = await this.prisma.returnPackage.findMany({
      where: { status: { in: WAREHOUSE_QUEUE_STATUSES } },
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      include: this.packageInclude(),
    });

    return { items };
  }

  async getById(id: string, actor?: AuthUser) {
    const pkg = await this.prisma.returnPackage.findUnique({
      where: { id },
      include: this.packageInclude(),
    });
    if (!pkg) throw new NotFoundException("Return package not found");

    if (actor?.role === UserRole.MANAGER) {
      const allowed = pkg.returns.some((r) => r.order.ownerId === actor.id);
      if (!allowed && pkg.returns.length > 0) {
        throw new ForbiddenException("You can only access returns for orders assigned to you");
      }
    }

    return pkg;
  }

  async receive(id: string, actor?: AuthUser) {
    assertWarehousePackageReceive(actor);
    const pkg = await this.prisma.returnPackage.findUnique({ where: { id } });
    if (!pkg) throw new NotFoundException("Return package not found");
    if (pkg.status === "RECEIVED_BY_WAREHOUSE") {
      return this.getById(id, actor);
    }
    await this.syncLinkedReturnsLogistics(id, "RECEIVED_BY_WAREHOUSE");
    return this.getById(id, actor);
  }

  async addItems(id: string, dto: AddReturnPackageItemsDto, actor?: AuthUser) {
    assertWarehousePackageItems(actor);

    const pkg = await this.prisma.returnPackage.findUnique({
      where: { id },
      include: { returns: true },
    });
    if (!pkg) throw new NotFoundException("Return package not found");
    if (pkg.status !== "RECEIVED_BY_WAREHOUSE") {
      throw new BadRequestException("Items can only be added after the package is received by warehouse");
    }

    await this.ensureOrderCanReturn(dto.orderId, actor);
    const returnItems = await this.validateReturnItems(dto.orderId, dto.items);

    await this.prisma.$transaction(async (tx) => {
      let orderReturn = pkg.returns.find(
        (r) => r.orderId === dto.orderId && r.status !== "CLOSED",
      );

      if (!orderReturn) {
        orderReturn = await tx.orderReturn.create({
          data: {
            orderId: dto.orderId,
            returnPackageId: id,
            itemsPending: false,
            status: "RECEIVED_BY_WAREHOUSE",
          },
        });
      } else {
        await tx.orderReturn.update({
          where: { id: orderReturn.id },
          data: { itemsPending: false },
        });
      }

      for (const item of returnItems) {
        const existing = await tx.orderReturnItem.findUnique({
          where: {
            orderReturnId_orderItemId: {
              orderReturnId: orderReturn!.id,
              orderItemId: item.orderItemId,
            },
          },
        });
        if (existing) {
          await tx.orderReturnItem.update({
            where: { id: existing.id },
            data: { qtyReturned: existing.qtyReturned + item.qtyReturned },
          });
        } else {
          await tx.orderReturnItem.create({
            data: {
              orderReturnId: orderReturn!.id,
              orderItemId: item.orderItemId,
              qtyReturned: item.qtyReturned,
            },
          });
        }
      }
    });

    await this.orderReturns.syncOrderStateFromReturns(dto.orderId);
    return this.getById(id, actor);
  }

  async completeInspection(id: string, actor?: AuthUser) {
    assertWarehousePackageItems(actor);

    const pkg = await this.prisma.returnPackage.findUnique({
      where: { id },
      include: { returns: { include: { items: true } } },
    });
    if (!pkg) throw new NotFoundException("Return package not found");
    if (pkg.status !== "RECEIVED_BY_WAREHOUSE") {
      throw new BadRequestException("Package must be received before completing inspection");
    }

    const activeReturns = pkg.returns.filter((r) => r.status !== "CLOSED");
    if (activeReturns.length === 0) {
      throw new BadRequestException("No active returns linked to this package");
    }

    for (const ret of activeReturns) {
      if (ret.itemsPending || ret.items.length === 0) {
        throw new BadRequestException(
          `Return for order ${ret.orderId} has no items — complete item breakdown first`,
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const ret of activeReturns) {
        if (ret.status === "RECEIVED_BY_WAREHOUSE") {
          await tx.orderReturn.update({
            where: { id: ret.id },
            data: { status: "INSPECTION", itemsPending: false },
          });
        }
      }
    });

    for (const ret of activeReturns) {
      await this.orderReturns.syncOrderStateFromReturns(ret.orderId);
    }

    return this.getById(id, actor);
  }

  async applyNpStatus(
    packageId: string,
    statusCode: string | null | undefined,
    statusText: string | null | undefined,
    received: boolean,
  ) {
    const pkg = await this.prisma.returnPackage.findUnique({ where: { id: packageId } });
    if (!pkg) return { updated: false };

    await this.prisma.returnPackage.update({
      where: { id: packageId },
      data: {
        ttnStatusCode: statusCode ?? null,
        ttnStatusText: statusText ?? null,
        ttnSyncedAt: new Date(),
      },
    });

    if (received && pkg.status === "IN_TRANSIT_BACK") {
      await this.syncLinkedReturnsLogistics(packageId, "RECEIVED_BY_WAREHOUSE");
      return { updated: true, received: true };
    }

    return { updated: true, received: false };
  }

  async syncActiveReturnPackages(opts?: { limit?: number }) {
    const limit = Math.min(Math.max(Number(opts?.limit ?? 100), 1), 500);

    const packages = await this.prisma.returnPackage.findMany({
      where: {
        status: "IN_TRANSIT_BACK",
        returns: { some: { status: { not: "CLOSED" } } },
      },
      orderBy: [{ ttnSyncedAt: { sort: "asc", nulls: "first" } }, { id: "asc" }],
      take: limit,
      select: { id: true, ttnNumber: true },
    });

    if (packages.length === 0) {
      return { ok: true, checked: 0, updatedPackages: 0, received: 0, skipped: 0 };
    }

    const chunks: Array<Array<{ id: string; ttnNumber: string }>> = [];
    let cur: Array<{ id: string; ttnNumber: string }> = [];
    for (const pkg of packages) {
      cur.push(pkg);
      if (cur.length >= 100) {
        chunks.push(cur);
        cur = [];
      }
    }
    if (cur.length) chunks.push(cur);

    let checked = 0;
    let updatedPackages = 0;
    let received = 0;
    let skipped = 0;

    for (const chunk of chunks) {
      checked += chunk.length;

      const resp = await this.np.call<Record<string, unknown>>(
        "TrackingDocument",
        "getStatusDocuments",
        {
          Documents: chunk.map((x) => ({ DocumentNumber: normalizeTtnNumber(x.ttnNumber) })),
        },
      );

      const arr = Array.isArray(resp?.data) ? resp.data : [];
      const byNumber = new Map<string, Record<string, unknown>>();
      for (const s of arr) {
        if (s?.Number) byNumber.set(String(s.Number), s);
      }

      for (const item of chunk) {
        const row = byNumber.get(normalizeTtnNumber(item.ttnNumber));
        if (!row) {
          skipped++;
          continue;
        }
        const statusCode = row.StatusCode != null ? String(row.StatusCode) : null;
        const statusText = row.Status != null ? String(row.Status) : null;
        const isReceived = isInboundReturnReceivedByNpStatus(statusCode, statusText);
        const result = await this.applyNpStatus(item.id, statusCode, statusText, isReceived);
        if (result.updated) updatedPackages++;
        if (result.received) received++;
      }
    }

    return { ok: true, checked, updatedPackages, received, skipped };
  }

  private packageInclude() {
    return {
      contact: { select: { id: true, firstName: true, lastName: true, phone: true } },
      returns: {
        include: {
          items: {
            include: {
              orderItem: {
                select: {
                  id: true,
                  qty: true,
                  price: true,
                  lineTotal: true,
                  productNameSnapshot: true,
                },
              },
            },
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              orderStage: true,
              ownerId: true,
              client: { select: { id: true, firstName: true, lastName: true } },
              company: { select: { id: true, name: true } },
            },
          },
        },
      },
    } satisfies Prisma.ReturnPackageInclude;
  }
}
