// src/np/np-ttn.controller.ts
import { Body, Controller, Delete, Get, Param, Post, Query, Req } from "@nestjs/common";
import { Request } from "express";
import { NpTtnService } from "./np-ttn.service";
import type { CreateNpTtnDto } from "./dto/create-np-ttn.dto";

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
  async createTtn(
    @Param("orderId") orderId: string,
    @Body() dto: CreateNpTtnDto,
    @Req() req: Request,
  ) {
    // Workaround: ValidationPipe/class-transformer can strip nested draft when it fails
    // nested validation; raw body has draft but dto.draft is undefined. Use raw body.
    const raw = req.body as Record<string, unknown>;
    if (!dto.profileId && !dto.draft && raw?.draft && typeof raw.draft === "object") {
      (dto as Record<string, unknown>).draft = raw.draft as CreateNpTtnDto["draft"];
    }
    return this.ttn.createFromOrder(orderId, dto);
  }

  // ✅ удалить ТТН из заказа (очистить deliveryData, удалить OrderTtn)
  @Delete("ttn/:orderId")
  async deleteTtn(@Param("orderId") orderId: string) {
    return this.ttn.clearTtnFromOrder(orderId);
  }
}
