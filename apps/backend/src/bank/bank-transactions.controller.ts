import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { normalizePagination } from "../common/pagination";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { BankTransactionsService } from "./bank-transactions.service";
import type { ListBankTransactionsQueryDto } from "./dto/list-bank-transactions-query.dto";

@Controller("bank/transactions")
@RequireModule(ModuleIds.Finance)
@Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
export class BankTransactionsController {
  constructor(private readonly service: BankTransactionsService) {}

  @Get()
  list(@Query() q: ListBankTransactionsQueryDto, @Req() req: Request & { user?: AuthUser }) {
    const pagination = normalizePagination(
      { page: q.page, pageSize: q.pageSize },
      { page: 1, pageSize: 50 },
    );
    return this.service.list(
      {
        unmatched: Boolean(q.unmatched),
        bankAccountId: q.bankAccountId,
        from: q.from,
        to: q.to,
        ...pagination,
      },
      req.user,
    );
  }
}
