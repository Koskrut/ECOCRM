import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { normalizePagination } from "../common/pagination";
import type { ValidationError } from "../common/validation";
import { validateString } from "../common/validation";
import { CompaniesService } from "./companies.service";
import type { CreateCompanyDto } from "./dto/create-company.dto";
import { validateCreateCompanyDto } from "./dto/create-company.dto";
import type { UpdateCompanyDto } from "./dto/update-company.dto";
import { validateUpdateCompanyDto } from "./dto/update-company.dto";

const assertValid = (errors: ValidationError[]): void => {
  if (errors.length === 0) {
    return;
  }
  const detail = errors.map((error) => `${error.field}: ${error.message}`).join(", ");
  throw new BadRequestException(`Validation failed: ${detail}`);
};

@Controller("/companies")
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  @Post()
  public async create(
    @Body() body: CreateCompanyDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const errors = validateCreateCompanyDto(body);
    assertValid(errors);
    return this.companiesService.create(body, req.user);
  }

  @Get()
  public async list(
    @Query() query: { search?: string; page?: string; pageSize?: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const pagination = normalizePagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    return this.companiesService.list(query.search, pagination, req.user);
  }

  @Get("/:id/change-history")
  public async getChangeHistory(
    @Param() params: { id: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    assertValid(errors);
    return this.companiesService.getChangeHistory(params.id, req.user);
  }

  @Get("/:id")
  public async findOne(
    @Param() params: { id: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    assertValid(errors);
    return this.companiesService.findOne(params.id, req.user);
  }

  @Get("/:id/addresses")
  public async listAddresses(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.companiesService.listAddresses(id, req.user);
  }

  @Post("/:id/addresses")
  public async createAddress(
    @Param("id") id: string,
    @Body()
    body: {
      label?: string;
      city?: string;
      addressText: string;
      lat?: number | null;
      lng?: number | null;
      googlePlaceId?: string | null;
      isDefault?: boolean;
    },
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.companiesService.createAddress(
      id,
      {
        label: body.label ?? null,
        city: body.city ?? null,
        addressText: String(body.addressText ?? ""),
        lat: body.lat ?? null,
        lng: body.lng ?? null,
        googlePlaceId: body.googlePlaceId ?? null,
        isDefault: body.isDefault,
      },
      req.user,
    );
  }

  @Patch("/:id/addresses/:addressId")
  public async updateAddress(
    @Param("id") id: string,
    @Param("addressId") addressId: string,
    @Body()
    body: {
      label?: string | null;
      city?: string | null;
      addressText?: string;
      lat?: number | null;
      lng?: number | null;
      googlePlaceId?: string | null;
    },
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.companiesService.updateAddress(id, addressId, body, req.user);
  }

  @Delete("/:id/addresses/:addressId")
  public async deleteAddress(
    @Param("id") id: string,
    @Param("addressId") addressId: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.companiesService.deleteAddress(id, addressId, req.user);
  }

  @Post("/:id/addresses/:addressId/set-default")
  public async setDefaultAddress(
    @Param("id") id: string,
    @Param("addressId") addressId: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.companiesService.setDefaultAddress(id, addressId, req.user);
  }

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Delete(":id")
  async remove(@Param("id") id: string) {
    return this.companiesService.remove(id);
  }

  @Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER)
  @Patch("/:id")
  public async update(
    @Param() params: { id: string },
    @Body() body: UpdateCompanyDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    errors.push(...validateUpdateCompanyDto(body));
    assertValid(errors);
    return this.companiesService.update(params.id, body, req.user);
  }
}
