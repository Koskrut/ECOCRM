import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles.decorator";
import { BankSyncService } from "../../bank/bank-sync.service";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";
import { parseCsvToRows, parsePrivat24CsvRows } from "./privat24-csv";
import { Privat24RequisitesService } from "./privat24-requisites.service";

@Controller("integrations/privat24/accounts")
@RequireModule(ModuleIds.Privat24)
@Roles(UserRole.ADMIN)
export class Privat24AccountsController {
  constructor(
    @Inject(Privat24RequisitesService) private readonly requisites: Privat24RequisitesService,
    @Inject(BankSyncService) private readonly sync: BankSyncService,
  ) {}

  @Get(":id/requisites-from-bank")
  getRequisitesFromBank(@Param("id") id: string) {
    return this.requisites.getRequisitesFromBank(id, undefined);
  }

  @Post(":id/requisites-from-bank")
  getRequisitesFromBankPost(
    @Param("id") id: string,
    @Body() body: { token?: string; clientId?: string; id?: string },
  ) {
    return this.requisites.getRequisitesFromBank(id, body);
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
