import {
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  HttpException,
  InternalServerErrorException,
  Query,
  Req,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { AnalyticsScopeService } from "./analytics-scope.service";
import {
  AnalyticsService,
  type AnalyticsMapPeriod,
  type AnalyticsMapResponse,
  type AnalyticsMapView,
} from "./analytics.service";
import { type AnalyticsFilterDto } from "./dto/analytics-filter.dto";
import { AnalyticsAttentionService } from "./services/analytics-attention.service";
import { AnalyticsClientsService } from "./services/analytics-clients.service";
import { AnalyticsDrilldownService } from "./services/analytics-drilldown.service";
import { AnalyticsFinanceService } from "./services/analytics-finance.service";
import { AnalyticsLeadsService } from "./services/analytics-leads.service";
import { AnalyticsManagersService } from "./services/analytics-managers.service";
import { AnalyticsOperationsService } from "./services/analytics-operations.service";
import { AnalyticsOverviewService } from "./services/analytics-overview.service";
import { AnalyticsProductsService } from "./services/analytics-products.service";
import { AnalyticsSalesService } from "./services/analytics-sales.service";
import { AnalyticsVisitsService } from "./services/analytics-visits.service";
import { resolveAnalyticsRange } from "./utils/analytics-date.util";

/** JSON response shapes (incl. compare rules): see `./contracts/analytics-http.contracts.ts`. */
@Controller("analytics")
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly scopeService: AnalyticsScopeService,
    private readonly overviewService: AnalyticsOverviewService,
    private readonly salesService: AnalyticsSalesService,
    private readonly leadsService: AnalyticsLeadsService,
    private readonly attentionService: AnalyticsAttentionService,
    private readonly managersService: AnalyticsManagersService,
    private readonly financeService: AnalyticsFinanceService,
    private readonly clientsService: AnalyticsClientsService,
    private readonly productsService: AnalyticsProductsService,
    private readonly visitsService: AnalyticsVisitsService,
    private readonly operationsService: AnalyticsOperationsService,
    private readonly drilldownService: AnalyticsDrilldownService,
  ) {}

  /**
   * GET /analytics/map?period=week|month&view=assigned|performance&managerId=&problemOnly=
   * ADMIN and LEAD (scoped to team). Returns org-chart assignments vs sales facts per region.
   */
  @Get("map")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getMap(
    @Query("period") periodRaw?: string,
    @Query("view") viewRaw?: string,
    @Query("managerId") managerId?: string,
    @Query("problemOnly") problemOnlyRaw?: string,
    @Req() req?: Request & { user?: AuthUser },
  ): Promise<AnalyticsMapResponse> {
    const actor = this.requireUser(req);
    const period: AnalyticsMapPeriod =
      periodRaw === "week" || periodRaw === "month" ? periodRaw : "month";
    const view: AnalyticsMapView =
      viewRaw === "performance" || viewRaw === "assigned" ? viewRaw : "assigned";
    const problemOnly = problemOnlyRaw === "true" || problemOnlyRaw === "1";
    try {
      const scope = await this.scopeService.resolveScope(actor, {
        managerId,
        allowLead: true,
      });
      return await this.analytics.getMapResponse(period, view, actor, scope, {
        managerFilterId: managerId ?? null,
        problemOnly,
      });
    } catch (e) {
      if (e instanceof HttpException) throw e;
      const message = e instanceof Error ? e.message : String(e);
      throw new InternalServerErrorException(message);
    }
  }

  @Get("overview")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getOverview(
    @Query() query: AnalyticsFilterDto,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const actor = this.requireUser(req);
    const scope = await this.scopeService.resolveScope(actor, { managerId: query.managerId, allowLead: true });
    const period = resolveAnalyticsRange(query);
    return this.overviewService.getOverview(period, scope, { compare: query.compare === "prev_period" });
  }

  @Get("sales")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getSales(
    @Query() query: AnalyticsFilterDto,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const actor = this.requireUser(req);
    const scope = await this.scopeService.resolveScope(actor, { managerId: query.managerId, allowLead: true });
    const period = resolveAnalyticsRange(query);
    return this.salesService.getSales(period, scope, { compare: query.compare === "prev_period" });
  }

  @Get("leads")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getLeads(
    @Query() query: AnalyticsFilterDto,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const actor = this.requireUser(req);
    const scope = await this.scopeService.resolveScope(actor, { managerId: query.managerId, allowLead: true });
    const period = resolveAnalyticsRange(query);
    return this.leadsService.getLeads(period, scope, { compare: query.compare === "prev_period" });
  }

  @Get("attention")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getAttention(
    @Query() query: AnalyticsFilterDto,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const actor = this.requireUser(req);
    const scope = await this.scopeService.resolveScope(actor, { managerId: query.managerId, allowLead: true });
    const period = resolveAnalyticsRange(query);
    return this.attentionService.getAttention(period, scope);
  }

  @Get("managers")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getManagers(
    @Query() query: AnalyticsFilterDto,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const actor = this.requireUser(req);
    const scope = await this.scopeService.resolveScope(actor, { managerId: query.managerId, allowLead: true });
    const period = resolveAnalyticsRange(query);
    return this.managersService.getManagers(period, scope);
  }

  @Get("finance")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getFinance(
    @Query() query: AnalyticsFilterDto,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const actor = this.requireUser(req);
    const scope = await this.scopeService.resolveScope(actor, { managerId: query.managerId, allowLead: true });
    const period = resolveAnalyticsRange(query);
    return this.financeService.getFinance(period, scope, { compare: query.compare === "prev_period" });
  }

  @Get("clients")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getClients(
    @Query() query: AnalyticsFilterDto,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const actor = this.requireUser(req);
    const scope = await this.scopeService.resolveScope(actor, { managerId: query.managerId, allowLead: true });
    const period = resolveAnalyticsRange(query);
    return this.clientsService.getClients(period, scope);
  }

  @Get("products")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getProducts(
    @Query() query: AnalyticsFilterDto,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const actor = this.requireUser(req);
    const scope = await this.scopeService.resolveScope(actor, { managerId: query.managerId, allowLead: true });
    const period = resolveAnalyticsRange(query);
    return this.productsService.getProducts(period, scope);
  }

  @Get("visits")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getVisits(
    @Query() query: AnalyticsFilterDto,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const actor = this.requireUser(req);
    const scope = await this.scopeService.resolveScope(actor, { managerId: query.managerId, allowLead: true });
    const period = resolveAnalyticsRange(query);
    return this.visitsService.getVisits(period, scope);
  }

  @Get("operations")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getOperations(
    @Query() query: AnalyticsFilterDto,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const actor = this.requireUser(req);
    const scope = await this.scopeService.resolveScope(actor, { managerId: query.managerId, allowLead: true });
    const period = resolveAnalyticsRange(query);
    return this.operationsService.getOperations(period, scope);
  }

  @Get("drilldown")
  @Roles(UserRole.ADMIN, UserRole.LEAD)
  async getDrilldown(
    @Query() query: AnalyticsFilterDto & { type?: string },
    @Req() req?: Request & { user?: AuthUser },
  ) {
    if (!query.type) throw new BadRequestException("type is required");
    const actor = this.requireUser(req);
    const scope = await this.scopeService.resolveScope(actor, { managerId: query.managerId, allowLead: true });
    const period = resolveAnalyticsRange(query);
    return this.drilldownService.getDrilldown(query.type, period, scope, { region: query.region });
  }

  private requireUser(req?: Request & { user?: AuthUser }): AuthUser {
    const actor = req?.user;
    if (!actor) throw new ForbiddenException("Authenticated user is required");
    return actor;
  }
}
