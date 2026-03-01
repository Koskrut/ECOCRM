import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { OrderStatus } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { PaymentsService } from "../payments/payments.service";
import { OrdersService } from "./orders.service";
import type { AddOrderItemDto } from "./dto/add-order-item.dto";
import type { CreateOrderDto } from "./dto/create-order.dto";
import type { UpdateOrderItemDto } from "./dto/update-order-item.dto";
import { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import type { UpdateOrderStatusDto } from "./dto/update-order-status.dto";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  @Get()
  list(@Query() q: ListOrdersQueryDto, @Req() req: Request & { user?: AuthUser }) {
    return this.orders.list(q, req.user);
  }

  @Get(":id/payments")
  getPayments(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.payments.listByOrderId(id, req.user);
  }

  @Get(":id/timeline")
  timeline(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.orders.getTimeline(id, req.user);
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
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.orders.update(id, dto, req.user);
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
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.orders.updateItem(id, itemId, dto, req.user);
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
