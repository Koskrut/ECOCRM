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
    // Workaround: ValidationPipe/class-transformer can strip nested draft or profileId;
    // raw body may have them. Restore from raw when DTO has them missing.
    const raw = req.body as Record<string, unknown>;
    if (!dto.profileId && !dto.draft && raw?.draft && typeof raw.draft === "object") {
      (dto as Record<string, unknown>).draft = raw.draft as CreateNpTtnDto["draft"];
    }
    const rawProfileId = raw?.profileId;
    if ((!dto.profileId || typeof dto.profileId !== "string" || !dto.profileId.trim()) && typeof rawProfileId === "string" && rawProfileId.trim()) {
      (dto as Record<string, unknown>).profileId = rawProfileId.trim();
    }
    try {
      return await this.ttn.createFromOrder(orderId, dto);
    } catch (err: unknown) {
      throw err;
    }
  }

  // ✅ удалить ТТН из заказа (очистить deliveryData, удалить OrderTtn)
  @Delete("ttn/:orderId")
  async deleteTtn(@Param("orderId") orderId: string) {
    return this.ttn.clearTtnFromOrder(orderId);
  }
}
