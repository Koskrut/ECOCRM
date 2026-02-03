import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { normalizePagination } from "../common/pagination";
import { ValidationError, validateString } from "../common/validation";
import { ContactsService } from "./contacts.service";
import {
  CreateContactDto,
  validateCreateContactDto,
} from "./dto/create-contact.dto";
import {
  UpdateContactDto,
  validateUpdateContactDto,
} from "./dto/update-contact.dto";

const assertValid = (errors: ValidationError[]): void => {
  if (errors.length === 0) {
    return;
  }
  const detail = errors.map((error) => `${error.field}: ${error.message}`).join(", ");
  throw new BadRequestException(`Validation failed: ${detail}`);
};

@Controller("/contacts")
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Post()
  public async create(@Body() body: CreateContactDto) {
    const errors = validateCreateContactDto(body);
    assertValid(errors);
    return this.contactsService.create(body);
  }

  @Get()
  public async list(
    @Query() query: { search?: string; companyId?: string; page?: string; pageSize?: string },
  ) {
    const pagination = normalizePagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    return this.contactsService.list(query.search, query.companyId, pagination);
  }

  @Get("/:id")
  public async findOne(@Param() params: { id: string }) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    assertValid(errors);
    return this.contactsService.findOne(params.id);
  }

  @Patch("/:id")
  public async update(
    @Param() params: { id: string },
    @Body() body: UpdateContactDto,
  ) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    errors.push(...validateUpdateContactDto(body));
    assertValid(errors);
    return this.contactsService.update(params.id, body);
  }
}
