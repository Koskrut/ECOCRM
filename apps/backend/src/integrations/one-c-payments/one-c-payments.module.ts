import { Module } from "@nestjs/common";
import { PaymentsModule } from "../../payments/payments.module";
import { PrismaModule } from "../../prisma/prisma.module";
import { OneCPaymentsController } from "./one-c-payments.controller";
import { OneCPaymentsImportService } from "./one-c-payments-import.service";
import { OneCPaymentsMatcherService } from "./one-c-payments-matcher.service";

@Module({
  imports: [PrismaModule, PaymentsModule],
  controllers: [OneCPaymentsController],
  providers: [OneCPaymentsImportService, OneCPaymentsMatcherService],
  exports: [OneCPaymentsImportService],
})
export class OneCPaymentsModule {}
