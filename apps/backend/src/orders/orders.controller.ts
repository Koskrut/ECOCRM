import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() q: any) {
    return this.orders.list(q);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.orders.getById(id);
  }

  // ✅ Timeline for OrderModal
  @Get(":id/timeline")
  timeline(@Param("id") id: string) {
    return this.orders.getTimeline(id);
  }

  @Post()
  create(@Body() dto: any) {
    return this.orders.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: any) {
    return this.orders.update(id, dto);
  }

  @Post(":id/items")
  addItem(@Param("id") id: string, @Body() dto: any) {
    return this.orders.addItem(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.orders.remove(id);
  }
}
