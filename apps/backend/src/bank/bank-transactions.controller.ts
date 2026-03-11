import { Controller, Get, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { normalizePagination } from "../common/pagination";
import { BankTransactionsService } from "./bank-transactions.service";
import type { ListBankTransactionsQueryDto } from "./dto/list-bank-transactions-query.dto";

@Controller("bank/transactions")
@Roles(UserRole.ADMIN)
export class BankTransactionsController {
  constructor(private readonly service: BankTransactionsService) {}

  @Get()
  list(@Query() q: ListBankTransactionsQueryDto) {
    const pagination = normalizePagination(
      { page: q.page, pageSize: q.pageSize },
      { page: 1, pageSize: 50 },
    );
    return this.service.list({
      unmatched: Boolean(q.unmatched),
      bankAccountId: q.bankAccountId,
      from: q.from,
      to: q.to,
      ...pagination,
    });
  }
}
