import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import { StoreMetaInitiateCheckoutDto, StoreMetaViewContentDto } from "./meta-conversions.dto";
import { clientIpFromRequest, headerValue } from "./meta-conversions.match";
import { MetaConversionsService } from "./meta-conversions.service";

@Controller("store/meta")
export class StoreMetaController {
  constructor(private readonly conversions: MetaConversionsService) {}

  @Get("config")
  config() {
    return this.conversions.publicBrowserConfig();
  }

  @Post("view-content")
  viewContent(@Req() req: Request, @Body() body: StoreMetaViewContentDto) {
    return this.conversions.trackViewContent({
      eventId: body.eventId,
      path: body.path,
      search: body.search ?? "",
      fbp: body.fbp,
      fbc: body.fbc,
      fbclid: body.fbclid,
      clientIpAddress: clientIpFromRequest(req),
      clientUserAgent: headerValue(req.headers["user-agent"]),
    });
  }

  @Post("initiate-checkout")
  initiateCheckout(@Req() req: Request, @Body() body: StoreMetaInitiateCheckoutDto) {
    return this.conversions.trackInitiateCheckout({
      eventId: body.eventId,
      value: body.value,
      currency: body.currency,
      channel: body.channel === "telegram" ? "telegram" : "website",
      contentIds: body.contentIds,
      contents: body.contents?.map((row) => ({
        id: row.id,
        quantity: row.quantity,
        itemPrice: row.itemPrice,
      })),
      numItems: body.numItems,
      fbp: body.fbp,
      fbc: body.fbc,
      fbclid: body.fbclid,
      eventSourceUrl: body.eventSourceUrl,
      clientIpAddress: clientIpFromRequest(req),
      clientUserAgent: headerValue(req.headers["user-agent"]),
    });
  }
}
