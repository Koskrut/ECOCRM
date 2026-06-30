// src/np/np-ttn.controller.ts
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { Request } from "express";
import { RequireModule } from "../modules/gating/require-module.decorator";
import { ModuleIds } from "../modules/module-ids";
import { NpTtnService } from "./np-ttn.service";
import type { CreateNpTtnDto } from "./dto/create-np-ttn.dto";

@Controller("np")
@RequireModule(ModuleIds.NovaPoshta)
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

  @Get("ttn/defaults")
  async ttnDefaults(@Query("orderId") orderId?: string) {
    return this.ttn.getTtnDefaults(orderId);
  }

  @Get("ttn/:orderId")
  async getTtn(
    @Param("orderId") orderId: string,
    @Query("shipmentId") shipmentId?: string,
    @Query("ttnId") ttnId?: string,
  ) {
    return this.ttn.getTtnDetailsByOrderId(orderId, { shipmentId, ttnId });
  }

  @Patch("ttn/:orderId")
  async updateTtn(
    @Param("orderId") orderId: string,
    @Body() dto: CreateNpTtnDto,
    @Req() req: Request,
    @Query("shipmentId") shipmentId?: string,
    @Query("ttnId") ttnId?: string,
  ) {
    const raw = req.body as Record<string, unknown>;
    if (!dto.profileId && !dto.draft && raw?.draft && typeof raw.draft === "object") {
      (dto as Record<string, unknown>).draft = raw.draft as CreateNpTtnDto["draft"];
    }
    const rawProfileId = raw?.profileId;
    if (
      (!dto.profileId || typeof dto.profileId !== "string" || !dto.profileId.trim()) &&
      typeof rawProfileId === "string" &&
      rawProfileId.trim()
    ) {
      (dto as Record<string, unknown>).profileId = rawProfileId.trim();
    }
    return this.ttn.updateTtnFromOrder(orderId, dto, { shipmentId, ttnId });
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
    const rawIgnoreDuplicateCheck = raw?.ignoreDuplicateCheck;
    if (
      typeof (dto as Record<string, unknown>).ignoreDuplicateCheck !== "boolean" &&
      typeof rawIgnoreDuplicateCheck === "boolean"
    ) {
      (dto as Record<string, unknown>).ignoreDuplicateCheck = rawIgnoreDuplicateCheck;
    }
    try {
      return await this.ttn.createFromOrder(orderId, dto);
    } catch (err: unknown) {
      throw err;
    }
  }

  @Post("ttn/:orderId/reuse-existing")
  async reuseExistingTtn(
    @Param("orderId") orderId: string,
    @Body() body: { sourceShipmentId?: string; sourceDocumentNumber?: string },
  ) {
    return this.ttn.reuseExistingTtnForOrder(orderId, {
      sourceShipmentId: body?.sourceShipmentId ?? null,
      sourceDocumentNumber: body?.sourceDocumentNumber ?? null,
    });
  }

  // ✅ удалить ТТН из заказа (очистить deliveryData, удалить OrderTtn)
  @Delete("ttn/:orderId")
  async deleteTtn(@Param("orderId") orderId: string) {
    return this.ttn.clearTtnFromOrder(orderId);
  }

  @Delete("shipment/:shipmentId/ttn")
  async deleteShipmentTtn(@Param("shipmentId") shipmentId: string) {
    return this.ttn.clearTtnFromShipment(shipmentId);
  }

  @Delete("shipment/:shipmentId/ttn/unlink")
  async unlinkShipmentTtn(@Param("shipmentId") shipmentId: string) {
    return this.ttn.unlinkTtnFromShipment(shipmentId);
  }
}
