import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  BadRequestException,
} from "@nestjs/common";
import { OrderStatus, UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { OrdersService } from "./orders.service";
import { CreateOrderDto, validateCreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Post()
  async create(@Body() body: CreateOrderDto) {
    const errors = validateCreateOrderDto(body);
    if (errors.length > 0) {
      throw new BadRequestException({ errors });
    }
    return this.ordersService.create(body);
  }

  @Get()
  async list(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: OrderStatus,
    @Query("search") search?: string,
  ) {
    // Вместо new Pagination создаем объект вручную
    const p = Number(page) || 1;
    const ps = Number(pageSize) || 10;
    
    const pagination = {
      page: p,
      pageSize: ps,
      limit: ps,
      offset: (p - 1) * ps,
    };

    return this.ordersService.list(pagination as any, { status, search });
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.ordersService.findOne(id);
  }

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Put(":id")
  async update(@Param("id") id: string, @Body() body: UpdateOrderDto) {
    return (this.ordersService as any).update(id, body);
  }

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Post(":id/items")
  async addItem(@Param("id") id: string, @Body() body: any) {
    return (this.ordersService as any).addItem(id, body);
  }

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Put(":id/items/:itemId")
  async updateItem(
    @Param("id") id: string,
    @Param("itemId") itemId: string,
    @Body() body: any,
  ) {
    return (this.ordersService as any).updateItem(id, itemId, body);
  }

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Delete(":id/items/:itemId")
  async removeItem(@Param("id") id: string, @Param("itemId") itemId: string) {
    return (this.ordersService as any).removeItem(id, itemId);
  }
}
