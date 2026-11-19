import { Body, Controller, Get, Patch, Post } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../../auth/roles.decorator";
import { UpdateMetaAudiencesDto } from "./meta-audience.dto";
import { MetaAudiencesService } from "./meta-audiences.service";

@Controller("settings/meta-audiences")
@Roles(UserRole.ADMIN)
export class MetaAudiencesController {
  constructor(private readonly audiences: MetaAudiencesService) {}

  @Get()
  get() {
    return this.audiences.getPublic();
  }

  @Patch()
  update(@Body() body: UpdateMetaAudiencesDto) {
    return this.audiences.update(body);
  }

  @Post("sync")
  sync() {
    return this.audiences.sync(true);
  }
}
