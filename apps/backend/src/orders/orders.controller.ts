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
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { OrdersService } from "./orders.service";
import type { AddOrderItemDto } from "./dto/add-order-item.dto";
import type { CreateOrderDto } from "./dto/create-order.dto";
import { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import type { UpdateOrderStatusDto } from "./dto/update-order-status.dto";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() q: ListOrdersQueryDto, @Req() req: Request & { user?: AuthUser }) {
    return this.orders.list(q, req.user);
  }

  @Get(":id")
  get(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.orders.getById(id, req.user);
  }

  @Get(":id/timeline")
  timeline(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.orders.getTimeline(id, req.user);
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
    @Req() req: Request & { user?: AuthUser },
  ) {
    const toStatus = dto.toStatus ?? dto.status;
    if (toStatus == null) {
      throw new BadRequestException("status or toStatus is required");
    }
    const userId = req.user?.id ?? "system";
    return this.orders.setStatus(
      id,
      {
        toStatus,
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
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.orders.addItem(id, dto, req.user);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.orders.remove(id, req.user);
  }
}
