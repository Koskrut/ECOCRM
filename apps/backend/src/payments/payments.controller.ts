import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { UserRole, PaymentSourceType } from "@prisma/client";
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
import type { TransferCreditDto } from "./dto/transfer-credit.dto";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";

@Controller("payments")
@RequireModule(ModuleIds.Finance)
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly service: PaymentsService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  list(@Query() q: ListPaymentsQueryDto, @Req() req: Request & { user?: AuthUser }) {
    const pagination = normalizePagination(
      { page: q.page, pageSize: q.pageSize },
      { page: 1, pageSize: 50 },
    );
    return this.service.list(
      {
        bankAccountId: q.bankAccountId,
        q: q.q,
        dateFrom: q.dateFrom,
        dateTo: q.dateTo,
        sourceType:
          q.sourceType === "CASH"
            ? PaymentSourceType.CASH
            : q.sourceType === "BANK"
              ? PaymentSourceType.BANK
              : undefined,
        ...pagination,
      },
      req.user,
    );
  }

  @Get("match-suggestions")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  matchSuggestions(
    @Query("transactionId") transactionId: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    // Thin proxy so clients can keep using /payments/* for finance UX.
    return this.service.getMatchSuggestionsForTransaction(transactionId, req.user);
  }

  @Post("allocate")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  allocate(@Body() dto: AllocatePaymentDto, @Req() req: Request & { user?: AuthUser }) {
    return this.service.allocate(dto, req.user);
  }

  @Post("allocate-split")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  allocateSplit(@Body() dto: AllocateSplitDto, @Req() req: Request & { user?: AuthUser }) {
    return this.service.allocateSplit(dto, req.user);
  }

  @Post("cash")
  createCash(@Body() dto: CreateCashPaymentDto, @Req() req: Request & { user?: AuthUser }) {
    return this.service.createCash(dto, req.user);
  }

  @Post("transfer-credit")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  transferCredit(
    @Body() dto: TransferCreditDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.service.transferCredit(dto, req.user);
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
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  splitPayment(
    @Param("id") id: string,
    @Body() dto: SplitPaymentDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.service.splitPayment(id, dto, req.user);
  }

  @Delete(":id/allocation")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  unallocate(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.service.unallocateBankPayment(id, req.user);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  deleteCash(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.service.deleteCashPayment(id, req.user);
  }
}
