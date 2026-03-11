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

  @Roles(UserRole.ADMIN, UserRole.LEAD)
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
  public async list(@Query() query: { search?: string; page?: string; pageSize?: string }) {
    const pagination = normalizePagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    return this.companiesService.list(query.search, pagination);
  }

  @Get("/:id/change-history")
  public async getChangeHistory(@Param() params: { id: string }) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    assertValid(errors);
    return this.companiesService.getChangeHistory(params.id);
  }

  @Get("/:id")
  public async findOne(@Param() params: { id: string }) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    assertValid(errors);
    return this.companiesService.findOne(params.id);
  }

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Delete(":id")
  async remove(@Param("id") id: string) {
    return this.companiesService.remove(id);
  }

  @Roles(UserRole.ADMIN, UserRole.LEAD)
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
