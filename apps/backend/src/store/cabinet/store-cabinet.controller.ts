import { Controller, Get, Post, Patch, Param, Query, Req, Body, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { ContactsService } from "../../contacts/contacts.service";
import { StoreJwtGuard } from "../auth/store-jwt.guard";
import { StoreCabinetService } from "./store-cabinet.service";
import { StoreTelegramLinkService } from "../telegram/store-telegram-link.service";
import { UpdateMeDto } from "./dto/update-me.dto";

type RequestWithCustomer = Request & {
  customer?: { customerId: string; contactId: string };
};

@Controller("store")
@UseGuards(StoreJwtGuard)
export class StoreCabinetController {
  constructor(
    private readonly cabinet: StoreCabinetService,
    private readonly telegramLink: StoreTelegramLinkService,
    private readonly contacts: ContactsService,
  ) {}

  @Get("me/shipping-profiles")
  async getShippingProfiles(@Req() req: RequestWithCustomer) {
    const contactId = req.customer!.contactId;
    // #region agent log
    fetch("http://localhost:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9e2801" },
      body: JSON.stringify({
        sessionId: "9e2801",
        location: "store-cabinet.controller:getShippingProfiles",
        message: "store shipping-profiles hit",
        data: { contactId },
        timestamp: Date.now(),
        hypothesisId: "H4",
      }),
    }).catch(() => {});
    // #endregion
    const result = await this.contacts.listShippingProfiles(contactId, undefined);
    // #region agent log
    fetch("http://localhost:7242/ingest/6d5146b2-d2ee-43a9-ac82-5385935623c0", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "9e2801" },
      body: JSON.stringify({
        sessionId: "9e2801",
        location: "store-cabinet.controller:listShippingProfiles_result",
        message: "listShippingProfiles result",
        data: { contactId, itemCount: result.items?.length ?? 0 },
        timestamp: Date.now(),
        hypothesisId: "H5",
      }),
    }).catch(() => {});
    // #endregion
    return result;
  }

  @Get("me")
  async getMe(@Req() req: RequestWithCustomer) {
    const contactId = req.customer!.contactId;
    return this.cabinet.getMe(contactId);
  }

  @Patch("me")
  async updateMe(@Req() req: RequestWithCustomer, @Body() dto: UpdateMeDto) {
    return this.cabinet.updateMe(req.customer!.contactId, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
    });
  }

  @Post("me/telegram/link")
  async getTelegramLink(@Req() req: RequestWithCustomer) {
    return this.telegramLink.createLink(req.customer!.contactId);
  }

  @Get("orders")
  async getOrders(
    @Req() req: RequestWithCustomer,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    const contactId = req.customer!.contactId;
    return this.cabinet.getOrders(
      contactId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 50,
    );
  }

  @Get("orders/:id")
  async getOrder(@Req() req: RequestWithCustomer, @Param("id") id: string) {
    return this.cabinet.getOrderById(req.customer!.contactId, id);
  }

  @Get("payments")
  async getPayments(
    @Req() req: RequestWithCustomer,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.cabinet.getPayments(
      req.customer!.contactId,
      page ? Number(page) : 1,
      pageSize ? Number(pageSize) : 50,
    );
  }
}
