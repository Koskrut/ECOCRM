import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  Body,
  Param,
  Query,
  Req,
  BadRequestException,
} from "@nestjs/common";
import { OrderStatus, UserRole, ActivityType } from "@prisma/client";
import { Request } from "express";
import { Roles } from "../auth/roles.decorator";
import { AuthUser } from "../auth/auth.types";
import { OrdersService } from "./orders.service";
import { CreateOrderDto, validateCreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { ActivitiesService } from "../activities/activities.service";

// ✅ NP
import { NpTtnService } from "../np/np-ttn.service";
import { CreateNpTtnDto } from "../np/dto/create-np-ttn.dto";

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly activitiesService: ActivitiesService,
    private readonly npTtnService: NpTtnService,
  ) {}

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Post()
  async create(
    @Body() body: CreateOrderDto,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!body.ownerId) {
      if (!req.user) throw new BadRequestException("User not found in request");
      (body as any).ownerId = req.user.id;
    }

    const errors = validateCreateOrderDto(body);
    if (errors.length > 0) throw new BadRequestException({ errors });

    return this.ordersService.create(body);
  }

  @Get()
  async list(
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Query("status") status?: OrderStatus,
    @Query("search") search?: string,
    @Query("companyId") companyId?: string,
    @Query("clientId") clientId?: string,
    @Query("ownerId") ownerId?: string,
  ) {
    const p = Number(page) || 1;
    const ps = Number(pageSize) || 10;

    const pagination = {
      page: p,
      pageSize: ps,
      limit: ps,
      offset: (p - 1) * ps,
    };

    return this.ordersService.list(pagination as any, {
      status,
      search,
      companyId,
      clientId,
      ownerId,
    });
  }

  @Get("board")
  async getBoard(
    @Query("search") search?: string,
    @Query("companyId") companyId?: string,
    @Query("ownerId") ownerId?: string,
  ) {
    const columns = await this.ordersService.board({ search, companyId, ownerId });
    return { columns };
  }

  @Patch(":id/status")
  async patchStatus(
    @Param("id") id: string,
    @Body() body: { status: OrderStatus; reason?: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) throw new BadRequestException("User not found in request");
    return this.ordersService.changeStatus(id, body, req.user.id);
  }

  @Get(":id")
  async findOne(@Param("id") id: string) {
    return this.ordersService.findOne(id);
  }

  @Get(":id/items/remaining-to-ship")
  async getRemainingToShip(@Param("id") id: string) {
    return this.ordersService.getRemainingToShip(id);
  }

  // ✅ Create NP TTN from Order (legacy route)
  @Post(":orderId/np/ttn")
  async createNpTtnFromOrder(
    @Param("orderId") orderId: string,
    @Body() dto: CreateNpTtnDto,
  ) {
    return this.npTtnService.createFromOrder(orderId, dto);
  }
  // ✅ Get NP TTN status for order
  // GET /orders/:id/np/status?sync=true|false
  @Get(":id/np/status")
  async getNpTtnStatus(
    @Param("id") id: string,
    @Query("sync") sync?: string,
  ) {
    const doSync = sync == null ? true : sync !== "false";
    return this.npTtnService.getTtnStatusByOrderId(id, { sync: doSync });
  }

  // ✅ Create TTN from Order (new route for UI: /orders/:id/ttn)
  // Фронт (TtnModal) шлёт:
  // { carrier: "NOVA_POSHTA", profileId?: string, createProfile?: {...} }
  // Мы маппим это в CreateNpTtnDto, который уже понимает NpTtnService.
  @Post(":id/ttn")
  async createTtnFromOrder(@Param("id") id: string, @Body() body: any) {
    if (!body || body.carrier !== "NOVA_POSHTA") {
      throw new BadRequestException("Only carrier NOVA_POSHTA is supported");
    }

    // Маппим в DTO, который ожидает npTtnService
    const dto: any = {
      carrier: "NOVA_POSHTA",
      profileId: body.profileId ?? null,
      createProfile: body.createProfile ?? null,
    };

    return this.npTtnService.createFromOrder(id, dto as CreateNpTtnDto);
  }

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Delete(":id")
  async remove(@Param("id") id: string) {
    return this.ordersService.remove(id);
  }

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Put(":id")
  async update(@Param("id") id: string, @Body() body: UpdateOrderDto) {
    return (this.ordersService as any).update(id, body);
  }

  @Roles(UserRole.ADMIN, UserRole.LEAD)
  @Post(":id/items")
  async addItem(@Param("id") id: string, @Body() body: any) {
    return this.ordersService.addItem(id, body);
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

  @Get(":id/timeline")
  async timeline(@Param("id") id: string) {
    const [activities, statusHistory] = await Promise.all([
      this.activitiesService.listForOrder(id),
      this.ordersService.getStatusHistory(id),
    ]);

    const activityEvents = activities.map((a: any) => ({
      id: a.id,
      source: "ACTIVITY" as const,
      type: a.type,
      title: a.title ?? a.type,
      body: a.body,
      occurredAt: (a.occurredAt ?? a.createdAt).toISOString(),
      createdAt: a.createdAt.toISOString(),
      createdBy: a.createdBy,
    }));

    const statusEvents = statusHistory.map((h: any) => ({
      id: `status_${h.id}`,
      source: "STATUS" as const,
      type: "STATUS_CHANGE" as const,
      title: "Status changed",
      body: `${h.fromStatus ?? "—"} → ${h.toStatus}`,
      occurredAt: h.createdAt.toISOString(),
      createdAt: h.createdAt.toISOString(),
      createdBy: h.changedBy,
    }));

    const items = [...activityEvents, ...statusEvents].sort(
      (x, y) => new Date(y.occurredAt).getTime() - new Date(x.occurredAt).getTime(),
    );

    return { items };
  }

  @Post(":id/activities")
  async addActivity(
    @Param("id") id: string,
    @Body() body: { type: ActivityType; title?: string; body: string; occurredAt?: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) throw new BadRequestException("User not found in request");
    const item = await this.activitiesService.createForOrder(id, body, req.user);
    return { item };
  }

  @Patch(":id")
  async updateOrder(
    @Param("id") id: string,
    @Body()
    body: {
      contactId?: string | null;
      companyId?: string | null;
      clientId?: string | null;
      comment?: string | null;
      discountAmount?: number;
    },
  ) {
    return this.ordersService.update(id, body);
  }
}
