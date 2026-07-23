import {
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
import { HelpAudience, UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RequirePermission } from "../rbac/permissions.decorator";
import { PermissionKeys } from "../rbac/rbac.constants";
import type { HelpArticleDto, HelpArticleListQuery, HelpCategoryDto, HelpContextQuery } from "./dto/help.dto";
import { HelpService } from "./help.service";

function parseAudience(value: unknown): HelpAudience | undefined {
  if (value === "PRODUCT" || value === "BUSINESS") return value;
  return undefined;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return undefined;
}

@Controller("help")
@Roles(UserRole.ADMIN, UserRole.LEAD, UserRole.MANAGER, UserRole.WAREHOUSE, UserRole.USER)
@RequirePermission(PermissionKeys.HelpRead)
export class HelpController {
  constructor(private readonly help: HelpService) {}

  @Get("categories")
  listCategories(@Query("audience") audienceRaw: string, @Req() req: Request & { user?: AuthUser }) {
    return this.help.listCategories(req.user!, parseAudience(audienceRaw));
  }

  @Get("articles")
  listArticles(@Query() query: Record<string, unknown>, @Req() req: Request & { user?: AuthUser }) {
    const parsed: HelpArticleListQuery = {
      q: typeof query.q === "string" ? query.q : undefined,
      audience: parseAudience(query.audience),
      categoryKey: typeof query.categoryKey === "string" ? query.categoryKey : undefined,
      routeKey: typeof query.routeKey === "string" ? query.routeKey : undefined,
      entityType: typeof query.entityType === "string" ? query.entityType : undefined,
      includeDrafts: parseBoolean(query.includeDrafts),
    };
    return this.help.listArticles(req.user!, parsed);
  }

  @Get("context")
  getContext(@Query() query: Record<string, unknown>, @Req() req: Request & { user?: AuthUser }) {
    const parsed: HelpContextQuery = {
      routeKey: typeof query.routeKey === "string" ? query.routeKey : undefined,
      entityType: typeof query.entityType === "string" ? query.entityType : undefined,
    };
    return this.help.getContextArticles(req.user!, parsed);
  }

  @Get("article/:slug")
  getBySlug(@Param("slug") slug: string, @Req() req: Request & { user?: AuthUser }) {
    return this.help.getArticleBySlug(req.user!, slug);
  }

  @Get("articles/:id")
  getById(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.help.getArticleById(req.user!, id);
  }

  @Post("categories")
  @RequirePermission(PermissionKeys.HelpWrite)
  createCategory(@Body() body: HelpCategoryDto, @Req() req: Request & { user?: AuthUser }) {
    return this.help.createCategory(req.user!, body);
  }

  @Patch("categories/:idOrKey")
  @RequirePermission(PermissionKeys.HelpWrite)
  updateCategory(
    @Param("idOrKey") idOrKey: string,
    @Body() body: Partial<HelpCategoryDto>,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.help.updateCategory(req.user!, idOrKey, body);
  }

  @Delete("categories/:idOrKey")
  @RequirePermission(PermissionKeys.HelpWrite)
  deleteCategory(@Param("idOrKey") idOrKey: string, @Req() req: Request & { user?: AuthUser }) {
    return this.help.deleteCategory(req.user!, idOrKey);
  }

  @Post("articles")
  @RequirePermission(PermissionKeys.HelpWrite)
  createArticle(@Body() body: HelpArticleDto, @Req() req: Request & { user?: AuthUser }) {
    return this.help.createArticle(req.user!, body);
  }

  @Patch("articles/:id")
  @RequirePermission(PermissionKeys.HelpWrite)
  updateArticle(
    @Param("id") id: string,
    @Body() body: Partial<HelpArticleDto>,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.help.updateArticle(req.user!, id, body);
  }

  @Delete("articles/:id")
  @RequirePermission(PermissionKeys.HelpWrite)
  deleteArticle(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.help.deleteArticle(req.user!, id);
  }

  @Post("articles/:id/publish")
  @RequirePermission(PermissionKeys.HelpWrite)
  publishArticle(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.help.publishArticle(req.user!, id);
  }

  @Post("articles/:id/reset-seed")
  @RequirePermission(PermissionKeys.HelpWrite)
  @Roles(UserRole.ADMIN)
  resetSeed(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.help.resetSeedArticle(req.user!, id);
  }

  @Post("admin/sync-seed")
  @RequirePermission(PermissionKeys.HelpWrite)
  @Roles(UserRole.ADMIN)
  syncSeed(@Req() req: Request & { user?: AuthUser }) {
    return this.help.syncProductSeed();
  }
}
