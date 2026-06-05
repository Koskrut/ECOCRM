import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { BankAccountsService } from "./bank-accounts.service";
import type { CreateBankAccountDto } from "./dto/create-bank-account.dto";
import type { UpdateBankAccountDto } from "./dto/update-bank-account.dto";

@Controller("bank/accounts")
@RequireModule(ModuleIds.Finance)
@Roles(UserRole.ADMIN)
export class BankAccountsController {
  constructor(private readonly service: BankAccountsService) {}

  @Post()
  create(@Body() dto: CreateBankAccountDto) {
    return this.service.create(dto);
  }

  @Get()
  list() {
    return this.service.list();
  }

  @Get("for-order")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  listForOrder(@Req() req: Request & { user?: AuthUser }) {
    return this.service.listForOrder(req.user?.id);
  }

  @Get("visibility")
  getVisibilitySettings() {
    return this.service.getVisibilitySettings();
  }

  @Patch("visibility")
  updateVisibilitySettings(
    @Body()
    body: {
      accountId: string;
      userIds: string[];
      defaultForUserIds?: string[];
    },
  ) {
    return this.service.updateVisibilitySettings(body);
  }

  @Patch("store-default")
  setStoreDefault(@Body() body: { bankAccountId?: string | null }) {
    const raw = body.bankAccountId;
    const id =
      raw === null || raw === undefined || (typeof raw === "string" && raw.trim() === "")
        ? null
        : String(raw).trim();
    return this.service.setStoreDefaultBankAccountId(id);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.service.getById(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateBankAccountDto) {
    return this.service.update(id, dto);
  }

  @Delete(":id")
  delete(@Param("id") id: string) {
    return this.service.delete(id);
  }
}
