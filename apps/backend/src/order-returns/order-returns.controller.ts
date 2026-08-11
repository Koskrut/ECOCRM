import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { ReturnStatus } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { OrderReturnsService } from "./order-returns.service";
import { ListOrderReturnsQueryDto } from "./dto/list-order-returns-query.dto";
import { UpdateReturnItemsDto, WaiveMisPickChecklistDto } from "./dto/mis-pick.dto";
import { UpdateReturnStatusDto } from "./dto/update-return-status.dto";
import { UpdateOrderReturnExternalCodeDto } from "./dto/update-order-return-external-code.dto";

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
    return this.orderReturns.updateStatus(id, status, req.user, dto.settlement);
  }

  @Get(":id/settlement-preview")
  settlementPreview(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.orderReturns.getSettlementPreview(id, req.user);
  }

  @Patch(":id/items")
  updateItems(
    @Param("id") id: string,
    @Body() dto: UpdateReturnItemsDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.orderReturns.updateReturnItems(id, dto, req.user);
  }

  @Patch(":id/waive-checklist")
  waiveChecklist(
    @Param("id") id: string,
    @Body() dto: WaiveMisPickChecklistDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.orderReturns.waiveChecklist(id, dto, req.user);
  }

  @Patch(":id/external-code")
  updateExternalCode(
    @Param("id") id: string,
    @Body() dto: UpdateOrderReturnExternalCodeDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.orderReturns.updateExternalCode(id, dto.externalCode, req.user);
  }
}
