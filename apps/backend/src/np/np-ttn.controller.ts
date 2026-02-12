// src/np/np-ttn.controller.ts
import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { NpTtnService } from "./np-ttn.service";
import { CreateNpTtnDto } from "./dto/create-np-ttn.dto";

@Controller("np")
export class NpTtnController {
  constructor(private readonly ttn: NpTtnService) {}

  // ✅ проверка, что env sender refs валидные
  @Get("sender/check")
  async checkSender() {
    return this.ttn.validateSenderRefs();
  }

  // ✅ sync статусов активных ТТН (ВАЖНО: объявить ДО /ttn/:orderId)
  @Post("ttn/sync-active")
  async syncActive(@Query("limit") limit?: string) {
    return this.ttn.syncActiveTtns({
      limit: limit ? Number(limit) : 200,
    });
  }

  // ✅ создать ТТН из заказа
  @Post("ttn/:orderId")
  async createTtn(@Param("orderId") orderId: string, @Body() dto: CreateNpTtnDto) {
    return this.ttn.createFromOrder(orderId, dto);
  }
}
