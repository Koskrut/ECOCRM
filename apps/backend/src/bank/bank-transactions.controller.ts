import { Body, Controller, Get, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { normalizePagination } from "../common/pagination";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { BankTransactionsService } from "./bank-transactions.service";
import type {
  IgnoreBankTransactionDto,
  ListBankTransactionsQueryDto,
} from "./dto/list-bank-transactions-query.dto";

function truthy(v: unknown): boolean {
  return v === true || v === "true" || v === "1";
}

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
        unmatched: truthy(q.unmatched),
        ignored: truthy(q.ignored),
        bankAccountId: q.bankAccountId,
        q: q.q,
        suggest: truthy(q.suggest),
        from: q.from,
        to: q.to,
        ...pagination,
      },
      req.user,
    );
  }

  @Get(":id/match-suggestions")
  matchSuggestions(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.service.getMatchSuggestions(id, req.user);
  }

  @Post(":id/auto-match")
  autoMatch(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.service.applyAutoMatch(id, req.user);
  }

  @Post(":id/ignore")
  ignore(
    @Param("id") id: string,
    @Body() body: IgnoreBankTransactionDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.service.ignore(id, body?.category, req.user);
  }

  @Post(":id/unignore")
  unignore(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.service.unignore(id, req.user);
  }
}
