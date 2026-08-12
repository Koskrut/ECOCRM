import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../../auth/auth.types";
import { Roles } from "../../auth/roles.decorator";
import { RequireModule } from "../../modules/gating/require-module.decorator";
import { ModuleIds } from "../../modules/module-ids";
import { OneCPaymentsImportService } from "./one-c-payments-import.service";
import type { CommitOneCPaymentsDto, SetOneCOverridesDto } from "./dto/one-c-payments.dto";

@Controller("one-c-payments")
@RequireModule(ModuleIds.OneCPayments)
export class OneCPaymentsController {
  constructor(private readonly service: OneCPaymentsImportService) {}

  private requireUser(req: Request & { user?: AuthUser }): AuthUser {
    if (!req.user) throw new BadRequestException("User not found in request");
    return req.user;
  }

  @Get("jobs")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  listJobs(
    @Query("limit") limit: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.service.listJobs(this.requireUser(req), limit ? Number(limit) : 20);
  }

  @Get("jobs/:id")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  getJob(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.service.getJob(id, this.requireUser(req));
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  upload(
    @UploadedFile() file: { buffer?: Buffer; originalname?: string } | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!file?.buffer?.length) throw new BadRequestException("File is required");
    return this.service.upload({
      actor: this.requireUser(req),
      fileBuffer: file.buffer,
      fileName: file.originalname,
    });
  }

  @Post("jobs/:id/overrides")
  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  setOverrides(
    @Param("id") id: string,
    @Body() body: SetOneCOverridesDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!body?.overrides || typeof body.overrides !== "object") {
      throw new BadRequestException("overrides object is required");
    }
    return this.service.setOverrides(id, this.requireUser(req), body.overrides);
  }

  @Post("jobs/:id/revalidate")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  revalidate(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.service.revalidate(id, this.requireUser(req));
  }

  @Post("jobs/:id/commit")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async commit(
    @Param("id") id: string,
    @Body() body: CommitOneCPaymentsDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const actor = this.requireUser(req);
    if (body?.overrides && typeof body.overrides === "object") {
      await this.service.setOverrides(id, actor, body.overrides);
    }
    return this.service.commit(id, actor);
  }
}
