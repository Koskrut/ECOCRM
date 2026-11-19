import { Body, Controller, Get, Post } from "@nestjs/common";
import { StoreMetaViewContentDto } from "./meta-conversions.dto";
import { MetaConversionsService } from "./meta-conversions.service";

@Controller("store/meta")
export class StoreMetaController {
  constructor(private readonly conversions: MetaConversionsService) {}

  @Get("config")
  config() {
    return this.conversions.publicBrowserConfig();
  }

  @Post("view-content")
  viewContent(@Body() body: StoreMetaViewContentDto) {
    return this.conversions.trackViewContent({
      eventId: body.eventId,
      path: body.path,
      search: body.search ?? "",
    });
  }
}
