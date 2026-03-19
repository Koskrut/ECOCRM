import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import type { Request } from "express";
import { FileInterceptor } from "@nestjs/platform-express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { BankAccountsService } from "./bank-accounts.service";
import { BankSyncService } from "./bank-sync.service";
import type { CreateBankAccountDto } from "./dto/create-bank-account.dto";
import type { UpdateBankAccountDto } from "./dto/update-bank-account.dto";
import { parseCsvToRows, parsePrivat24CsvRows } from "./providers/privat24.provider";

@Controller("bank/accounts")
@Roles(UserRole.ADMIN)
export class BankAccountsController {
  constructor(
    private readonly service: BankAccountsService,
    private readonly sync: BankSyncService,
  ) {}

  @Post()
  create(@Body() dto: CreateBankAccountDto) {
    return this.service.create(dto);
  }

  @Get()
  list() {
    return this.service.list();
  }

  /** List active accounts for order form (id, name only). Available to managers. */
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

  /** Fetch requisites (legalName, bankDetails) from Privat24 by account IBAN. GET = use saved credentials; POST body { token?, clientId?, id? } = use these instead (e.g. from form before save). */
  @Get(":id/requisites-from-bank")
  getRequisitesFromBank(@Param("id") id: string) {
    return this.service.getRequisitesFromBank(id, undefined);
  }

  @Post(":id/requisites-from-bank")
  getRequisitesFromBankPost(
    @Param("id") id: string,
    @Body() body: { token?: string; clientId?: string; id?: string },
  ) {
    return this.service.getRequisitesFromBank(id, body);
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

  @Post(":id/import")
  @UseInterceptors(FileInterceptor("file"))
  async importStatement(
    @Param("id") id: string,
    @UploadedFile() file: { buffer?: Buffer } | undefined,
  ) {
    const buffer = file?.buffer;
    if (!buffer) throw new BadRequestException("File is required");
    const rows = parseCsvToRows(buffer);
    const transactions = parsePrivat24CsvRows(rows);
    const count = await this.sync.importTransactions(id, transactions);
    return { imported: count };
  }
}
