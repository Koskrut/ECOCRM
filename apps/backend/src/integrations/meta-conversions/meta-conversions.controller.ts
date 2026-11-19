import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles.decorator";
import { UpdateMetaConversionsDto } from "./meta-conversions.dto";
import { MetaConversionsService } from "./meta-conversions.service";

@Controller("settings/meta-conversions")
@Roles(UserRole.ADMIN)
export class MetaConversionsController {
  constructor(private readonly conversions: MetaConversionsService) {}

  @Get()
  get() {
    return this.conversions.getPublic();
  }

  @Patch()
  update(@Body() body: UpdateMetaConversionsDto) {
    return this.conversions.update(body);
  }

  @Post("test")
  test() {
    return this.conversions.sendTestPurchase();
  }
}
