import { Module } from "@nestjs/common";
import { ContactsModule } from "../contacts/contacts.module";
import { PrismaModule } from "../prisma/prisma.module";
import { DailyAgendaController } from "./daily-agenda.controller";
import { DailyAgendaService } from "./daily-agenda.service";

@Module({
  imports: [PrismaModule, ContactsModule],
  controllers: [DailyAgendaController],
  providers: [DailyAgendaService],
  exports: [DailyAgendaService],
})
export class DailyAgendaModule {}
