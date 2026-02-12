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
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { normalizePagination } from "../common/pagination";
import { ValidationError, validateString } from "../common/validation";
import { CompaniesService } from "./companies.service";
import {
  CreateCompanyDto,
  validateCreateCompanyDto,
} from "./dto/create-company.dto";
import {
  UpdateCompanyDto,
  validateUpdateCompanyDto,
} from "./dto/update-company.dto";

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
  public async create(@Body() body: CreateCompanyDto) {
    const errors = validateCreateCompanyDto(body);
    assertValid(errors);
    return this.companiesService.create(body);
  }

  @Get()
  public async list(@Query() query: { search?: string; page?: string; pageSize?: string }) {
    const pagination = normalizePagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    return this.companiesService.list(query.search, pagination);
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
  ) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    errors.push(...validateUpdateCompanyDto(body));
    assertValid(errors);
    return this.companiesService.update(params.id, body);
  }
}
