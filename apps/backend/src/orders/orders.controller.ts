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
import { normalizePagination } from "../common/pagination";
import { ValidationError, validateString } from "../common/validation";
import { AddOrderItemDto, validateAddOrderItemDto } from "./dto/add-order-item.dto";
import {
  CreateOrderDto,
  validateCreateOrderDto,
} from "./dto/create-order.dto";
import {
  UpdateOrderDto,
  validateUpdateOrderDto,
} from "./dto/update-order.dto";
import {
  UpdateOrderItemDto,
  validateUpdateOrderItemDto,
} from "./dto/update-order-item.dto";
import { OrdersService } from "./orders.service";

const assertValid = (errors: ValidationError[]): void => {
  if (errors.length === 0) {
    return;
  }
  const detail = errors.map((error) => `${error.field}: ${error.message}`).join(", ");
  throw new BadRequestException(`Validation failed: ${detail}`);
};

@Controller("/orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  public async create(@Body() body: CreateOrderDto) {
    const errors = validateCreateOrderDto(body);
    assertValid(errors);
    return this.ordersService.createOrder(body);
  }

  @Get()
  public async list(@Query() query: { page?: string; pageSize?: string }) {
    const pagination = normalizePagination({
      page: query.page,
      pageSize: query.pageSize,
    });
    return this.ordersService.listOrders(pagination);
  }

  @Get("/:id")
  public async getOne(@Param() params: { id: string }) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    assertValid(errors);
    return this.ordersService.getOrder(params.id);
  }

  @Patch("/:id")
  public async update(
    @Param() params: { id: string },
    @Body() body: UpdateOrderDto,
  ) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    errors.push(...validateUpdateOrderDto(body));
    assertValid(errors);
    return this.ordersService.updateOrder(params.id, body);
  }

  @Post("/:id/items")
  public addItem(
    @Param() params: { id: string },
    @Body() body: AddOrderItemDto,
  ) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    errors.push(...validateAddOrderItemDto(body));
    assertValid(errors);
    return this.ordersService.addItem(params.id, body);
  }

  @Patch("/:id/items/:itemId")
  public updateItem(
    @Param() params: { id: string; itemId: string },
    @Body() body: UpdateOrderItemDto,
  ) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    validateString(params.itemId, "itemId", errors);
    errors.push(...validateUpdateOrderItemDto(body));
    assertValid(errors);
    return this.ordersService.updateItem(params.id, params.itemId, body);
  }

  @Delete("/:id/items/:itemId")
  public async removeItem(@Param() params: { id: string; itemId: string }) {
    const errors: ValidationError[] = [];
    validateString(params.id, "id", errors);
    validateString(params.itemId, "itemId", errors);
    assertValid(errors);
    await this.ordersService.removeItem(params.id, params.itemId);
    return { ok: true };
  }
}
