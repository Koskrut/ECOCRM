import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  StreamableFile,
} from "@nestjs/common";
import type { OrderStage, OrderStatus } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { IntegrationPortsService } from "../integration-ports/integration-ports.service";
import { PaymentRequestsService } from "../payment-requests/payment-requests.service";
import { CreatePaymentRequestDto } from "../payment-requests/dto/create-payment-request.dto";
import { Roles } from "../auth/roles.decorator";
import { UserRole } from "@prisma/client";
import { OrderReturnsService } from "../order-returns/order-returns.service";
import { OrdersDocumentsService } from "./orders-documents.service";
import { OrdersPipelineConfigService } from "./pipeline/orders-pipeline-config.service";
import { PutOrderPipelineDto } from "./dto/put-order-pipeline.dto";
import { OrdersService } from "./orders.service";
import type { AddOrderItemDto } from "./dto/add-order-item.dto";
import type { CreateOrderReturnDto } from "../order-returns/dto/create-order-return.dto";
import type { CreateOrderDto } from "./dto/create-order.dto";
import type { UpdateOrderItemDto } from "./dto/update-order-item.dto";
import { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import type { UpdateOrderStageDto } from "./dto/update-order-stage.dto";
import type { UpdateOrderStatusDto } from "./dto/update-order-status.dto";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly integrations: IntegrationPortsService,
    private readonly paymentRequests: PaymentRequestsService,
    private readonly ordersDocuments: OrdersDocumentsService,
    private readonly orderReturns: OrderReturnsService,
    private readonly ordersPipelineConfig: OrdersPipelineConfigService,
  ) {}

  @Get()
  list(@Query() q: ListOrdersQueryDto, @Req() req: Request & { user?: AuthUser }) {
    return this.orders.list(q, req.user);
  }

  @Get("fulfillment-queue")
  fulfillmentQueue(
    @Query("warehouseIds") warehouseIds: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.orders.listFulfillmentQueue(req.user, warehouseIds);
  }

  @Get("pipeline")
  getPipeline(@Req() _req: Request & { user?: AuthUser }) {
    return this.ordersPipelineConfig.getPipelineForApi();
  }

  @Put("pipeline")
  @Roles(UserRole.ADMIN)
  putPipeline(@Body() dto: PutOrderPipelineDto, @Req() req: Request & { user?: AuthUser }) {
    return this.ordersPipelineConfig.putPipelineSnapshot(dto, req.user);
  }

  @Get("pipeline/history")
  @Roles(UserRole.ADMIN)
  getPipelineHistory(
    @Query("page") page: string | undefined,
    @Query("pageSize") pageSize: string | undefined,
  ) {
    return this.ordersPipelineConfig.getHistory({
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  @Get(":id/payments")
  getPayments(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.integrations.listOrderPaymentsByOrderId(id, req.user);
  }

  @Get(":id/payment-requests")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  listPaymentRequests(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.paymentRequests.listByOrderId(id, req.user);
  }

  @Post(":id/payment-requests")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  createPaymentRequest(
    @Param("id") id: string,
    @Body() dto: CreatePaymentRequestDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.paymentRequests.create(id, dto, req.user);
  }

  @Get(":id/returns")
  getReturns(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.orderReturns.listByOrderId(id, req.user);
  }

  @Post(":id/returns")
  createReturn(
    @Param("id") id: string,
    @Body() dto: CreateOrderReturnDto,
    @Req() req: Request & { user?: AuthUser; body?: { items?: Array<{ orderItemId: string; qtyReturned: number }> } },
  ) {
    // Workaround: ValidationPipe/class-transformer can strip nested items; use raw body fallback
    const raw = req.body ?? {};
    const items =
      (Array.isArray(dto?.items) && dto.items.length > 0 ? dto.items : null) ??
      (Array.isArray(raw.items) ? raw.items : []);
    return this.orderReturns.create(id, { items }, req.user);
  }

  @Get(":id/timeline")
  timeline(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.orders.getTimeline(id, req.user);
  }

  @Get(":id/documents/invoice")
  async getInvoicePdf(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<StreamableFile> {
    const buffer = await this.ordersDocuments.buildInvoicePdf(id, req.user);
    return new StreamableFile(buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="invoice-${id}.pdf"`,
    });
  }

  @Get(":id/documents/waybill")
  async getWaybillPdf(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ): Promise<StreamableFile> {
    const buffer = await this.ordersDocuments.buildWaybillPdf(id, req.user);
    return new StreamableFile(buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="waybill-${id}.pdf"`,
    });
  }

  @Get(":id")
  get(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.orders.getById(id, req.user);
  }

  @Post()
  create(@Body() dto: CreateOrderDto, @Req() req: Request & { user?: AuthUser }) {
    return this.orders.create(dto, req.user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateOrderDto,
    @Req() req: Request & { user?: AuthUser; body?: Record<string, unknown> },
  ) {
    const raw = req.body ?? {};
    const deliveryMethod =
      dto.deliveryMethod ?? (raw.deliveryMethod as UpdateOrderDto["deliveryMethod"]);
    const dtoWithDelivery =
      deliveryMethod !== undefined ? { ...dto, deliveryMethod } : dto;
    return this.orders.update(id, dtoWithDelivery, req.user);
  }

  @Post(":id/send-to-sheet")
  async sendToSheet(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    await this.orders.getById(id, req.user);
    await this.integrations.sendOrderToSheet(id, { exportDate: new Date() });
    return { ok: true };
  }

  @Post(":id/split-by-stock")
  splitByStock(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.orders.splitByStock(id, req.user);
  }

  @Patch(":id/stage")
  setStage(
    @Param("id") id: string,
    @Body() dto: UpdateOrderStageDto,
    @Req() req: Request & { user?: AuthUser; body?: Record<string, unknown> },
  ) {
    const raw = req.body ?? {};
    const toStage =
      dto.toStage ?? (raw.toStage as string) ?? (raw.orderStage as string);
    if (toStage == null) {
      throw new BadRequestException("toStage or orderStage is required");
    }
    return this.orders.setOrderStage(id, toStage as OrderStage, req.user, dto.reason ?? null);
  }

  @Patch(":id/status")
  setStatus(
    @Param("id") id: string,
    @Body() dto: UpdateOrderStatusDto,
    @Req() req: Request & { user?: AuthUser; body?: Record<string, unknown> },
  ) {
    // Workaround: ValidationPipe/class-transformer can strip toStatus; use raw body fallback
    const raw = req.body ?? {};
    const toStatus =
      dto.toStatus ?? dto.status ?? (raw.toStatus as string) ?? (raw.status as string);
    if (toStatus == null) {
      throw new BadRequestException("status or toStatus is required");
    }
    const userId = req.user?.id ?? "system";
    return this.orders.setStatus(
      id,
      {
        toStatus: toStatus as OrderStatus,
        reason: dto.reason ?? null,
        changedBy: userId,
      },
      req.user,
    );
  }

  @Post(":id/items")
  addItem(
    @Param("id") id: string,
    @Body() dto: AddOrderItemDto,
    @Req() req: Request & { user?: AuthUser; body?: Record<string, unknown> },
  ) {
    // Workaround: ValidationPipe/class-transformer can strip fields; use raw body fallback
    const raw = req.body ?? {};
    const productId = dto.productId ?? (raw.productId as string);
    const qty = dto.qty ?? (raw.qty as number);
    const price = dto.price ?? (raw.price as number);
    if (!productId) throw new BadRequestException("productId is required");
    if (qty == null || price == null) throw new BadRequestException("qty and price are required");
    return this.orders.addItem(
      id,
      { productId, qty, price },
      req.user,
    );
  }

  @Patch(":id/items/:itemId")
  updateItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateOrderItemDto,
    @Req() req: Request & { user?: AuthUser; body?: Record<string, unknown> },
  ) {
    // Workaround: ValidationPipe/class-transformer can strip qty/price; use raw body fallback (same as addItem)
    const raw = req.body ?? {};
    const qtyRaw = dto.qty ?? raw.qty;
    const priceRaw = dto.price ?? raw.price;
    const merged: { qty?: number; price?: number } = {};
    if (qtyRaw !== undefined && qtyRaw !== null && qtyRaw !== "") {
      const q = Number(qtyRaw);
      if (Number.isFinite(q)) merged.qty = q;
    }
    if (priceRaw !== undefined && priceRaw !== null && priceRaw !== "") {
      const p = Number(priceRaw);
      if (Number.isFinite(p)) merged.price = p;
    }
    return this.orders.updateItem(id, itemId, merged, req.user);
  }

  @Delete(":id/items/:itemId")
  removeItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.orders.removeItem(id, itemId, req.user);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.orders.remove(id, req.user);
  }
}
