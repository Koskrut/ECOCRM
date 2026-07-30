import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import {
  AddReturnPackageItemsDto,
  CreateReturnPackageDto,
  ListReturnPackagesQueryDto,
  UpdateReturnPackageTtnDto,
} from "./dto/return-package.dto";
import { ReturnPackagesService } from "./return-packages.service";

@Controller("return-packages")
export class ReturnPackagesController {
  constructor(private readonly returnPackages: ReturnPackagesService) {}

  @Post()
  create(
    @Body() dto: CreateReturnPackageDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.returnPackages.create(dto, req.user);
  }

  @Get("warehouse-queue")
  listWarehouseQueue(@Req() req: Request & { user?: AuthUser }) {
    return this.returnPackages.listWarehouseQueue(req.user);
  }

  @Get()
  list(
    @Query() q: ListReturnPackagesQueryDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.returnPackages.list(q, req.user);
  }

  @Get(":id")
  getById(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.returnPackages.getById(id, req.user);
  }

  @Patch(":id/ttn")
  updateTtn(
    @Param("id") id: string,
    @Body() dto: UpdateReturnPackageTtnDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.returnPackages.updateTtn(id, dto.ttnNumber, req.user);
  }

  @Post(":id/receive")
  receive(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.returnPackages.receive(id, req.user);
  }

  @Post(":id/items")
  addItems(
    @Param("id") id: string,
    @Body() dto: AddReturnPackageItemsDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.returnPackages.addItems(id, dto, req.user);
  }

  @Post(":id/complete-inspection")
  completeInspection(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.returnPackages.completeInspection(id, req.user);
  }
}
