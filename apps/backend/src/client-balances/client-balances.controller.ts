import { Body, Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { ClientBalancesService } from "./client-balances.service";
import type { ApplyCreditDto } from "./dto/apply-credit.dto";
import type { SettleReturnDto } from "./dto/settle-return.dto";

@Controller("client-balances")
@RequireModule(ModuleIds.Finance)
export class ClientBalancesController {
  constructor(@Inject(ClientBalancesService) private readonly service: ClientBalancesService) {}

  @Get("contacts/:contactId")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  getContactBalance(@Param("contactId") contactId: string) {
    return this.service.getBalanceForHolder("CONTACT", contactId);
  }

  @Get("contacts/:contactId/transactions")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  listContactTransactions(
    @Param("contactId") contactId: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    return this.service.listTransactions(
      {
        holderKind: "CONTACT",
        holderId: contactId,
        page: page ? Number(page) : 1,
        pageSize: pageSize ? Number(pageSize) : 30,
      },
      req?.user,
    );
  }

  @Get("companies/:companyId")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  getCompanyBalance(@Param("companyId") companyId: string) {
    return this.service.getBalanceForHolder("COMPANY", companyId);
  }

  @Get("orders/:orderId")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  getOrderBalance(@Param("orderId") orderId: string, @Req() req: Request & { user?: AuthUser }) {
    return this.service.getBalanceForOrder(orderId, req.user);
  }

  @Post("orders/:orderId/apply")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  applyCredit(
    @Param("orderId") orderId: string,
    @Body() dto: ApplyCreditDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.service.applyCreditToOrder(orderId, dto, req.user);
  }

  @Get("returns/:returnId/settlement-preview")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  settlementPreview(@Param("returnId") returnId: string, @Req() req: Request & { user?: AuthUser }) {
    return this.service.getReturnSettlementPreview(returnId, req.user);
  }

  @Post("returns/:returnId/settle")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  settleReturn(
    @Param("returnId") returnId: string,
    @Body() dto: SettleReturnDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.service.settleReturn(returnId, dto, req.user);
  }
}
