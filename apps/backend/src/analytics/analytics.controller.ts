import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  InternalServerErrorException,
  Query,
  Req,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { AnalyticsScopeService } from "./analytics-scope.service";
import { AnalyticsFilterDto } from "./dto/analytics-filter.dto";
import {
  AnalyticsService,
  type AnalyticsMapPeriod,
  type AnalyticsMapRegionRow,
} from "./analytics.service";
import { AnalyticsAttentionService } from "./services/analytics-attention.service";
import { AnalyticsClientsService } from "./services/analytics-clients.service";
import { AnalyticsDrilldownService } from "./services/analytics-drilldown.service";
import { AnalyticsFinanceService } from "./services/analytics-finance.service";
import { AnalyticsLeadsService } from "./services/analytics-leads.service";
import { AnalyticsManagersService } from "./services/analytics-managers.service";
import { AnalyticsOverviewService } from "./services/analytics-overview.service";
import { AnalyticsOperationsService } from "./services/analytics-operations.service";
import { AnalyticsProductsService } from "./services/analytics-products.service";
import { AnalyticsSalesService } from "./services/analytics-sales.service";
import { AnalyticsVisitsService } from "./services/analytics-visits.service";
import { resolveAnalyticsRange } from "./utils/analytics-date.util";

@Controller("analytics")
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly scopeService: AnalyticsScopeService,
    private readonly overview: AnalyticsOverviewService,
    private readonly operations: AnalyticsOperationsService,
    private readonly sales: AnalyticsSalesService,
    private readonly leads: AnalyticsLeadsService,
    private readonly attention: AnalyticsAttentionService,
    private readonly managers: AnalyticsManagersService,
    private readonly finance: AnalyticsFinanceService,
    private readonly clients: AnalyticsClientsService,
    private readonly products: AnalyticsProductsService,
    private readonly visits: AnalyticsVisitsService,
    private readonly drilldown: AnalyticsDrilldownService,
  ) {}

  /**
   * GET /analytics/map?period=week|month — ADMIN only (geo-sensitive).
   */
  @Get("map")
  async getMap(
    @Query("period") periodRaw?: string,
    @Req() req?: Request & { user?: AuthUser },
  ): Promise<AnalyticsMapRegionRow[]> {
    const actor = req?.user;
    if (actor?.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Analytics map is available only for ADMIN");
    }
    const period: AnalyticsMapPeriod =
      periodRaw === "week" || periodRaw === "month" ? periodRaw : "month";
    try {
      return await this.analytics.getMapStats(period, actor);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("overview")
  async getOverview(@Query() q: AnalyticsFilterDto, @Req() req: Request & { user?: AuthUser }) {
    const actor = this.requireActor(req);
    const scope = await this.scopeService.resolveScope(actor, {
      managerId: q.managerId,
      allowLead: true,
    });
    const period = resolveAnalyticsRange(q);
    const compare = q.compare === "prev_period";
    try {
      return await this.overview.getOverview(period, scope, { compare });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("sales")
  async getSales(@Query() q: AnalyticsFilterDto, @Req() req: Request & { user?: AuthUser }) {
    const actor = this.requireActor(req);
    const scope = await this.scopeService.resolveScope(actor, {
      managerId: q.managerId,
      allowLead: true,
    });
    const period = resolveAnalyticsRange(q);
    const compare = q.compare === "prev_period";
    try {
      return await this.sales.getSales(period, scope, { compare });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("leads")
  async getLeads(@Query() q: AnalyticsFilterDto, @Req() req: Request & { user?: AuthUser }) {
    const actor = this.requireActor(req);
    const scope = await this.scopeService.resolveScope(actor, {
      managerId: q.managerId,
      allowLead: true,
    });
    const period = resolveAnalyticsRange(q);
    const compare = q.compare === "prev_period";
    try {
      return await this.leads.getLeads(period, scope, { compare });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("attention")
  async getAttention(@Query() q: AnalyticsFilterDto, @Req() req: Request & { user?: AuthUser }) {
    const actor = this.requireActor(req);
    const scope = await this.scopeService.resolveScope(actor, {
      managerId: q.managerId,
      allowLead: true,
    });
    resolveAnalyticsRange(q);
    try {
      return { data: await this.attention.getAttention(scope) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("managers")
  async getManagers(@Query() q: AnalyticsFilterDto, @Req() req: Request & { user?: AuthUser }) {
    const actor = this.requireAdminOrLead(req);
    const scope = await this.scopeService.resolveScope(actor, {
      managerId: q.managerId,
      allowLead: true,
    });
    const period = resolveAnalyticsRange(q);
    try {
      return { period, ...(await this.managers.getManagers(period, scope)) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("finance")
  async getFinance(@Query() q: AnalyticsFilterDto, @Req() req: Request & { user?: AuthUser }) {
    const actor = this.requireAdminOrLead(req);
    const scope = await this.scopeService.resolveScope(actor, {
      managerId: q.managerId,
      allowLead: true,
    });
    const period = resolveAnalyticsRange(q);
    try {
      return { period, data: await this.finance.getFinance(period, scope) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("clients")
  async getClients(@Query() q: AnalyticsFilterDto, @Req() req: Request & { user?: AuthUser }) {
    const actor = this.requireAdminOrLead(req);
    const scope = await this.scopeService.resolveScope(actor, {
      managerId: q.managerId,
      allowLead: true,
    });
    const period = resolveAnalyticsRange(q);
    try {
      return { period, data: await this.clients.getClients(period, scope) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("products")
  async getProducts(@Query() q: AnalyticsFilterDto, @Req() req: Request & { user?: AuthUser }) {
    const actor = this.requireAdminOrLead(req);
    const scope = await this.scopeService.resolveScope(actor, {
      managerId: q.managerId,
      allowLead: true,
    });
    const period = resolveAnalyticsRange(q);
    try {
      return { period, data: await this.products.getProducts(period, scope) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("visits")
  async getVisits(@Query() q: AnalyticsFilterDto, @Req() req: Request & { user?: AuthUser }) {
    const actor = this.requireAdminOrLead(req);
    const scope = await this.scopeService.resolveScope(actor, {
      managerId: q.managerId,
      allowLead: true,
    });
    const period = resolveAnalyticsRange(q);
    try {
      return { period, data: await this.visits.getVisits(period, scope) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("operations")
  async getOperations(@Query() q: AnalyticsFilterDto, @Req() req: Request & { user?: AuthUser }) {
    const actor = this.requireAdminOrLead(req);
    const scope = await this.scopeService.resolveScope(actor, {
      managerId: q.managerId,
      allowLead: true,
    });
    const period = resolveAnalyticsRange(q);
    try {
      return { period, data: await this.operations.getOperations(period, scope) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("drilldown")
  async getDrilldown(
    @Req() req: Request & { user?: AuthUser },
    @Query("type") type: string,
    @Query() q: AnalyticsFilterDto,
    @Query("page") pageRaw?: string,
    @Query("pageSize") pageSizeRaw?: string,
  ) {
    if (!type) {
      throw new BadRequestException("type is required");
    }
    const actor = this.requireAdminOrLead(req);
    const scope = await this.scopeService.resolveScope(actor, {
      managerId: q.managerId,
      allowLead: true,
    });
    const period = resolveAnalyticsRange(q);
    const page = Math.max(1, parseInt(pageRaw ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(pageSizeRaw ?? "25", 10) || 25));
    try {
      return {
        period,
        ...(await this.drilldown.drilldown(type, period, scope, page, pageSize)),
      };
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  private requireActor(req: Request & { user?: AuthUser }): AuthUser {
    const actor = req.user;
    if (!actor) {
      throw new ForbiddenException("Unauthorized");
    }
    if (actor.role !== UserRole.ADMIN && actor.role !== UserRole.LEAD) {
      throw new ForbiddenException("Analytics is available for ADMIN and LEAD only");
    }
    return actor;
  }

  private requireAdminOrLead(req: Request & { user?: AuthUser }): AuthUser {
    return this.requireActor(req);
  }
}
