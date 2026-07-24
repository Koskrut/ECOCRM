import { Controller, Delete, Get, Param, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { normalizePagination } from "../common/pagination";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { PayerAliasService } from "./payer-alias.service";

@Controller("bank/payer-aliases")
@RequireModule(ModuleIds.Finance)
export class PayerAliasesController {
  constructor(private readonly service: PayerAliasService) {}

  @Get()
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  list(
    @Query() q: { q?: string; page?: number; pageSize?: number },
    @Req() _req: Request & { user?: AuthUser },
  ) {
    const pagination = normalizePagination(
      { page: q.page, pageSize: q.pageSize },
      { page: 1, pageSize: 50 },
    );
    return this.service.list({
      q: q.q,
      page: pagination.page,
      pageSize: pagination.pageSize,
    });
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  delete(@Param("id") id: string) {
    return this.service.delete(id);
  }
}
