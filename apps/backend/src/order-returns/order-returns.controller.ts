import { Body, Controller, Get, Param, Patch, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { OrderReturnsService } from "./order-returns.service";
import type { ListOrderReturnsQueryDto } from "./dto/list-order-returns-query.dto";
import type { UpdateReturnStatusDto } from "./dto/update-return-status.dto";
import type { ReturnStatus } from "@prisma/client";

@Controller("order-returns")
export class OrderReturnsController {
  constructor(private readonly orderReturns: OrderReturnsService) {}

  @Get()
  list(
    @Query() q: ListOrderReturnsQueryDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.orderReturns.list(q, req.user);
  }

  @Get(":id")
  getById(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.orderReturns.getById(id, req.user);
  }

  @Patch(":id/status")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateReturnStatusDto,
    @Req() req: Request & { user?: AuthUser; body?: Record<string, unknown> },
  ) {
    const raw = req.body ?? {};
    const status = (dto.status ?? (raw.status as string)) as ReturnStatus;
    return this.orderReturns.updateStatus(id, status, req.user);
  }
}
