import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { normalizePagination } from "../common/pagination";
import { PaymentsService } from "./payments.service";
import type { AllocatePaymentDto } from "./dto/allocate-payment.dto";
import type { AllocateSplitDto } from "./dto/allocate-split.dto";
import type { CreateCashPaymentDto } from "./dto/create-cash-payment.dto";
import type { ListPaymentsQueryDto } from "./dto/list-payments-query.dto";
import type { UpdatePaymentDto } from "./dto/update-payment.dto";
import type { SplitPaymentDto } from "./dto/split-payment.dto";

@Controller("payments")
export class PaymentsController {
  constructor(private readonly service: PaymentsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  list(@Query() q: ListPaymentsQueryDto) {
    const pagination = normalizePagination(
      { page: q.page, pageSize: q.pageSize },
      { page: 1, pageSize: 50 },
    );
    return this.service.list({
      bankAccountId: q.bankAccountId,
      ...pagination,
    });
  }

  @Post("allocate")
  @Roles(UserRole.ADMIN)
  allocate(@Body() dto: AllocatePaymentDto, @Req() req: Request & { user?: AuthUser }) {
    return this.service.allocate(dto, req.user);
  }

  @Post("allocate-split")
  @Roles(UserRole.ADMIN)
  allocateSplit(@Body() dto: AllocateSplitDto, @Req() req: Request & { user?: AuthUser }) {
    return this.service.allocateSplit(dto, req.user);
  }

  @Post("cash")
  createCash(@Body() dto: CreateCashPaymentDto, @Req() req: Request & { user?: AuthUser }) {
    return this.service.createCash(dto, req.user);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdatePaymentDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.service.update(id, dto, req.user);
  }

  @Post(":id/split")
  @Roles(UserRole.ADMIN)
  splitPayment(
    @Param("id") id: string,
    @Body() dto: SplitPaymentDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.service.splitPayment(id, dto, req.user);
  }
}
