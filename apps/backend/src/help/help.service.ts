import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from "@nestjs/common";
import { Prisma, type HelpArticleStatus, type HelpAudience, type UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import { PermissionKeys } from "../rbac/rbac.constants";
import { RbacService } from "../rbac/rbac.service";
import type {
  HelpArticleBindingDto,
  HelpArticleDto,
  HelpArticleListQuery,
  HelpCategoryDto,
  HelpContextQuery,
} from "./dto/help.dto";
import { getSeedArticleByKey, HELP_SEED_ARTICLES, HELP_SEED_CATEGORIES, HELP_SEED_REVISION } from "./seed/crm-guides";

const articleInclude = {
  category: true,
  bindings: { orderBy: { sortOrder: "asc" as const } },
} satisfies Prisma.HelpArticleInclude;

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

function parseVisibleRoles(value: unknown): string[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  return value.filter((v): v is string => typeof v === "string");
}

function isVisibleForRole(visibleRoles: unknown, role: UserRole): boolean {
  const roles = parseVisibleRoles(visibleRoles);
  if (!roles || roles.length === 0) return true;
  return roles.includes(role);
}

function jsonOrNull(value: string[] | null | undefined): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value;
}

function isLocallyEditedArticle(article: {
  updatedById: string | null;
  updatedAt: Date;
  publishedAt: Date | null;
}): boolean {
  if (!article.updatedById) return false;
  if (!article.publishedAt) return true;
  return article.updatedAt.getTime() > article.publishedAt.getTime() + 60_000;
}

@Injectable()
export class HelpService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedIfEmpty();
    await this.syncProductSeed();
  }

  async seedIfEmpty(): Promise<void> {
    const count = await this.prisma.helpCategory.count();
    if (count > 0) return;
    await this.runSeed(false);
  }

  async runSeed(forceNewArticlesOnly = true): Promise<void> {
    const categoryIdByKey = new Map<string, string>();
    const categoryAudienceByKey = new Map<string, HelpAudience>();

    for (const cat of HELP_SEED_CATEGORIES) {
      const row = await this.prisma.helpCategory.upsert({
        where: { key: cat.key },
        create: {
          key: cat.key,
          title: cat.title,
          audience: cat.audience,
          sortOrder: cat.sortOrder,
          icon: cat.icon ?? null,
        },
        update: {
          title: cat.title,
          audience: cat.audience,
          sortOrder: cat.sortOrder,
          icon: cat.icon ?? null,
        },
      });
      categoryIdByKey.set(cat.key, row.id);
      categoryAudienceByKey.set(cat.key, cat.audience);
    }

    for (const article of HELP_SEED_ARTICLES) {
      const categoryId = categoryIdByKey.get(article.categoryKey);
      if (!categoryId) continue;

      const existing = article.seedKey
        ? await this.prisma.helpArticle.findUnique({ where: { seedKey: article.seedKey } })
        : null;

      if (existing && forceNewArticlesOnly) continue;

      const data = {
        slug: article.slug,
        seedKey: article.seedKey,
        categoryId,
        audience: categoryAudienceByKey.get(article.categoryKey) ?? "PRODUCT",
        status: article.status,
        locale: "uk",
        title: article.title,
        excerpt: article.excerpt,
        bodyMd: article.bodyMd,
        sortOrder: article.sortOrder,
        visibleRoles: article.visibleRoles ?? undefined,
        seedRevision: article.seedRevision ?? HELP_SEED_REVISION,
        publishedAt: article.status === "PUBLISHED" ? new Date() : null,
      };

      const saved = existing
        ? await this.prisma.helpArticle.update({ where: { id: existing.id }, data })
        : await this.prisma.helpArticle.create({ data });

      if (article.bindings?.length) {
        await this.prisma.helpArticleBinding.deleteMany({ where: { articleId: saved.id } });
        await this.prisma.helpArticleBinding.createMany({
          data: article.bindings.map((b, index) => ({
            articleId: saved.id,
            routeKey: b.routeKey ?? null,
            entityType: b.entityType ?? null,
            sortOrder: b.sortOrder ?? index * 10,
          })),
        });
      }
    }
  }

  async syncProductSeed(): Promise<{ created: number; updated: number; skipped: number }> {
    const stats = { created: 0, updated: 0, skipped: 0 };
    const categoryIdByKey = new Map<string, string>();
    const categoryAudienceByKey = new Map<string, HelpAudience>();

    for (const cat of HELP_SEED_CATEGORIES) {
      if (cat.audience !== "PRODUCT") continue;
      const row = await this.prisma.helpCategory.upsert({
        where: { key: cat.key },
        create: {
          key: cat.key,
          title: cat.title,
          audience: cat.audience,
          sortOrder: cat.sortOrder,
          icon: cat.icon ?? null,
        },
        update: {
          title: cat.title,
          audience: cat.audience,
          sortOrder: cat.sortOrder,
          icon: cat.icon ?? null,
        },
      });
      categoryIdByKey.set(cat.key, row.id);
      categoryAudienceByKey.set(cat.key, cat.audience);
    }

    for (const seed of HELP_SEED_ARTICLES) {
      if (!seed.seedKey) continue;
      const categoryId = categoryIdByKey.get(seed.categoryKey);
      if (!categoryId) continue;

      const targetRevision = seed.seedRevision ?? HELP_SEED_REVISION;
      const existing = await this.prisma.helpArticle.findUnique({
        where: { seedKey: seed.seedKey },
        include: { bindings: true },
      });

      if (!existing) {
        const saved = await this.prisma.helpArticle.create({
          data: {
            slug: seed.slug,
            seedKey: seed.seedKey,
            categoryId,
            audience: categoryAudienceByKey.get(seed.categoryKey) ?? "PRODUCT",
            status: seed.status,
            locale: "uk",
            title: seed.title,
            excerpt: seed.excerpt,
            bodyMd: seed.bodyMd,
            sortOrder: seed.sortOrder,
            visibleRoles: seed.visibleRoles ?? undefined,
            seedRevision: targetRevision,
            publishedAt: seed.status === "PUBLISHED" ? new Date() : null,
          },
        });
        if (seed.bindings?.length) {
          await this.prisma.helpArticleBinding.createMany({
            data: seed.bindings.map((b, index) => ({
              articleId: saved.id,
              routeKey: b.routeKey ?? null,
              entityType: b.entityType ?? null,
              sortOrder: b.sortOrder ?? index * 10,
            })),
          });
        }
        stats.created += 1;
        continue;
      }

      const currentRevision = existing.seedRevision ?? 0;
      if (currentRevision >= targetRevision) continue;

      if (isLocallyEditedArticle(existing)) {
        stats.skipped += 1;
        continue;
      }

      await this.prisma.helpArticle.update({
        where: { id: existing.id },
        data: {
          title: seed.title,
          excerpt: seed.excerpt,
          bodyMd: seed.bodyMd,
          sortOrder: seed.sortOrder,
          visibleRoles: seed.visibleRoles ?? undefined,
          seedRevision: targetRevision,
          updatedById: null,
        },
      });

      if (seed.bindings?.length) {
        await this.upsertBindings(
          existing.id,
          seed.bindings.map((b, index) => ({
            routeKey: b.routeKey ?? undefined,
            entityType: b.entityType ?? undefined,
            sortOrder: b.sortOrder ?? index * 10,
          })),
        );
      }

      stats.updated += 1;
    }

    return stats;
  }

  private async canWrite(user: AuthUser, audience?: HelpAudience): Promise<boolean> {
    const hasWrite = await this.rbac.hasAllPermissions(user, [PermissionKeys.HelpWrite]);
    if (!hasWrite) return false;
    if (user.role === "ADMIN") return true;
    if (user.role === "LEAD") {
      if (!audience || audience === "BUSINESS") return true;
      return false;
    }
    return false;
  }

  private async assertWrite(user: AuthUser, audience: HelpAudience): Promise<void> {
    const ok = await this.canWrite(user, audience);
    if (!ok) throw new ForbiddenException("Insufficient permissions to edit help content");
  }

  private async canReadDrafts(user: AuthUser): Promise<boolean> {
    return this.rbac.hasAllPermissions(user, [PermissionKeys.HelpWrite]);
  }

  async listCategories(user: AuthUser, audience?: HelpAudience) {
    const categories = await this.prisma.helpCategory.findMany({
      where: audience ? { audience } : undefined,
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      include: {
        articles: {
          where: { status: "PUBLISHED" },
          select: { id: true, visibleRoles: true },
        },
      },
    });

    const includeDrafts = await this.canReadDrafts(user);

    return categories.map((cat) => {
      const visibleCount = cat.articles.filter((a) => isVisibleForRole(a.visibleRoles, user.role)).length;
      return {
        id: cat.id,
        key: cat.key,
        title: cat.title,
        audience: cat.audience,
        sortOrder: cat.sortOrder,
        icon: cat.icon,
        articleCount: includeDrafts ? visibleCount : visibleCount,
      };
    });
  }

  private buildArticleWhere(
    user: AuthUser,
    query: HelpArticleListQuery,
    includeDrafts: boolean,
  ): Prisma.HelpArticleWhereInput {
    const where: Prisma.HelpArticleWhereInput = {};

    if (query.audience) where.audience = query.audience;
    if (query.categoryKey) where.category = { key: query.categoryKey };
    if (query.routeKey) where.bindings = { some: { routeKey: query.routeKey } };
    if (query.entityType) where.bindings = { some: { entityType: query.entityType } };

    if (!includeDrafts) {
      where.status = "PUBLISHED";
    }

    if (query.q?.trim()) {
      const q = query.q.trim();
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { excerpt: { contains: q, mode: "insensitive" } },
        { bodyMd: { contains: q, mode: "insensitive" } },
      ];
    }

    return where;
  }

  private filterArticlesByRole<T extends { visibleRoles: unknown; status: HelpArticleStatus }>(
    items: T[],
    user: AuthUser,
    includeDrafts: boolean,
  ): T[] {
    return items.filter((item) => {
      if (!includeDrafts && item.status !== "PUBLISHED") return false;
      return isVisibleForRole(item.visibleRoles, user.role);
    });
  }

  private serializeArticle(article: Prisma.HelpArticleGetPayload<{ include: typeof articleInclude }>) {
    return {
      id: article.id,
      slug: article.slug,
      seedKey: article.seedKey,
      categoryId: article.categoryId,
      category: article.category
        ? {
            id: article.category.id,
            key: article.category.key,
            title: article.category.title,
            audience: article.category.audience,
          }
        : null,
      audience: article.audience,
      status: article.status,
      locale: article.locale,
      title: article.title,
      excerpt: article.excerpt,
      bodyMd: article.bodyMd,
      sortOrder: article.sortOrder,
      visibleRoles: parseVisibleRoles(article.visibleRoles),
      seedRevision: article.seedRevision,
      bindings: article.bindings.map((b) => ({
        id: b.id,
        routeKey: b.routeKey,
        entityType: b.entityType,
        sortOrder: b.sortOrder,
      })),
      publishedAt: article.publishedAt,
      createdAt: article.createdAt,
      updatedAt: article.updatedAt,
    };
  }

  async listArticles(user: AuthUser, query: HelpArticleListQuery) {
    const includeDrafts = query.includeDrafts === true && (await this.canReadDrafts(user));
    const where = this.buildArticleWhere(user, query, includeDrafts);

    const articles = await this.prisma.helpArticle.findMany({
      where,
      include: articleInclude,
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    });

    return {
      items: this.filterArticlesByRole(articles, user, includeDrafts).map((a) =>
        this.serializeArticle(a),
      ),
    };
  }

  async getArticleBySlug(user: AuthUser, slug: string) {
    const includeDrafts = await this.canReadDrafts(user);
    const article = await this.prisma.helpArticle.findUnique({
      where: { slug },
      include: articleInclude,
    });
    if (!article) throw new NotFoundException("Article not found");
    if (!includeDrafts && article.status !== "PUBLISHED") {
      throw new NotFoundException("Article not found");
    }
    if (!isVisibleForRole(article.visibleRoles, user.role)) {
      throw new NotFoundException("Article not found");
    }
    return this.serializeArticle(article);
  }

  async getArticleById(user: AuthUser, id: string) {
    const includeDrafts = await this.canReadDrafts(user);
    const article = await this.prisma.helpArticle.findUnique({
      where: { id },
      include: articleInclude,
    });
    if (!article) throw new NotFoundException("Article not found");
    if (!includeDrafts && article.status !== "PUBLISHED") {
      throw new NotFoundException("Article not found");
    }
    if (!isVisibleForRole(article.visibleRoles, user.role)) {
      throw new NotFoundException("Article not found");
    }
    return this.serializeArticle(article);
  }

  async getContextArticles(user: AuthUser, query: HelpContextQuery) {
    if (!query.routeKey && !query.entityType) {
      return { items: [] };
    }

    const includeDrafts = await this.canReadDrafts(user);
    const where: Prisma.HelpArticleWhereInput = {
      status: includeDrafts ? undefined : "PUBLISHED",
      bindings: {
        some: {
          OR: [
            query.routeKey ? { routeKey: query.routeKey } : undefined,
            query.entityType ? { entityType: query.entityType } : undefined,
          ].filter(Boolean) as Prisma.HelpArticleBindingWhereInput[],
        },
      },
    };

    const articles = await this.prisma.helpArticle.findMany({
      where,
      include: articleInclude,
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      take: 20,
    });

    return {
      items: this.filterArticlesByRole(articles, user, includeDrafts).map((a) => ({
        id: a.id,
        slug: a.slug,
        title: a.title,
        excerpt: a.excerpt,
        audience: a.audience,
        category: a.category ? { key: a.category.key, title: a.category.title } : null,
      })),
    };
  }

  async createCategory(user: AuthUser, body: HelpCategoryDto) {
    await this.assertWrite(user, body.audience);
    return this.prisma.helpCategory.create({
      data: {
        key: body.key,
        title: body.title,
        audience: body.audience,
        sortOrder: body.sortOrder ?? 0,
        icon: body.icon ?? null,
      },
    });
  }

  async updateCategory(user: AuthUser, idOrKey: string, body: Partial<HelpCategoryDto>) {
    const category = await this.findCategory(idOrKey);
    const audience = body.audience ?? category.audience;
    await this.assertWrite(user, audience);
    return this.prisma.helpCategory.update({
      where: { id: category.id },
      data: {
        title: body.title,
        audience: body.audience,
        sortOrder: body.sortOrder,
        icon: body.icon,
      },
    });
  }

  async deleteCategory(user: AuthUser, idOrKey: string) {
    const category = await this.findCategory(idOrKey);
    await this.assertWrite(user, category.audience);
    await this.prisma.helpCategory.delete({ where: { id: category.id } });
    return { ok: true };
  }

  private async findCategory(idOrKey: string) {
    const category = await this.prisma.helpCategory.findFirst({
      where: { OR: [{ id: idOrKey }, { key: idOrKey }] },
    });
    if (!category) throw new NotFoundException("Category not found");
    return category;
  }

  private async resolveCategoryId(categoryKey: string) {
    const category = await this.prisma.helpCategory.findUnique({ where: { key: categoryKey } });
    if (!category) throw new BadRequestException(`Unknown category: ${categoryKey}`);
    return category;
  }

  private validateBindings(bindings?: HelpArticleBindingDto[]) {
    if (!bindings) return;
    for (const b of bindings) {
      if (!b.routeKey && !b.entityType) {
        throw new BadRequestException("Each binding must have routeKey or entityType");
      }
    }
  }

  private async upsertBindings(articleId: string, bindings?: HelpArticleBindingDto[]) {
    await this.prisma.helpArticleBinding.deleteMany({ where: { articleId } });
    if (!bindings?.length) return;
    await this.prisma.helpArticleBinding.createMany({
      data: bindings.map((b, index) => ({
        articleId,
        routeKey: b.routeKey ?? null,
        entityType: b.entityType ?? null,
        sortOrder: b.sortOrder ?? index * 10,
      })),
    });
  }

  async createArticle(user: AuthUser, body: HelpArticleDto) {
    await this.assertWrite(user, body.audience);
    this.validateBindings(body.bindings);

    const category = await this.resolveCategoryId(body.categoryKey);
    const slug = body.slug?.trim() || slugify(body.title);
    if (!slug) throw new BadRequestException("Could not derive slug from title");

    const existingSlug = await this.prisma.helpArticle.findUnique({ where: { slug } });
    if (existingSlug) throw new BadRequestException("Slug already exists");

    const article = await this.prisma.helpArticle.create({
      data: {
        slug,
        categoryId: category.id,
        audience: body.audience,
        status: body.status ?? "DRAFT",
        locale: body.locale ?? "uk",
        title: body.title,
        excerpt: body.excerpt ?? null,
        bodyMd: body.bodyMd,
        sortOrder: body.sortOrder ?? 0,
        visibleRoles: body.visibleRoles ?? undefined,
        createdById: user.id,
        updatedById: user.id,
        publishedAt: body.status === "PUBLISHED" ? new Date() : null,
      },
    });

    await this.upsertBindings(article.id, body.bindings);

    return this.getArticleById(user, article.id);
  }

  async updateArticle(user: AuthUser, id: string, body: Partial<HelpArticleDto>) {
    const existing = await this.prisma.helpArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Article not found");

    const audience = body.audience ?? existing.audience;
    await this.assertWrite(user, audience);

    if (existing.audience === "PRODUCT" && user.role !== "ADMIN") {
      throw new ForbiddenException("Only ADMIN can edit PRODUCT articles");
    }

    this.validateBindings(body.bindings);

    let categoryId = existing.categoryId;
    if (body.categoryKey) {
      const category = await this.resolveCategoryId(body.categoryKey);
      categoryId = category.id;
    }

    let slug = existing.slug;
    if (body.slug?.trim()) {
      slug = body.slug.trim();
      const conflict = await this.prisma.helpArticle.findFirst({
        where: { slug, NOT: { id } },
      });
      if (conflict) throw new BadRequestException("Slug already exists");
    }

    await this.prisma.helpArticle.update({
      where: { id },
      data: {
        slug,
        categoryId,
        audience: body.audience,
        status: body.status,
        locale: body.locale,
        title: body.title,
        excerpt: body.excerpt,
        bodyMd: body.bodyMd,
        sortOrder: body.sortOrder,
        visibleRoles: jsonOrNull(body.visibleRoles === undefined ? undefined : body.visibleRoles),
        updatedById: user.id,
        publishedAt:
          body.status === "PUBLISHED"
            ? existing.publishedAt ?? new Date()
            : body.status === "DRAFT"
              ? null
              : undefined,
      },
    });

    if (body.bindings) {
      await this.upsertBindings(id, body.bindings);
    }

    return this.getArticleById(user, id);
  }

  async deleteArticle(user: AuthUser, id: string) {
    const existing = await this.prisma.helpArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Article not found");
    await this.assertWrite(user, existing.audience);
    if (existing.seedKey && user.role !== "ADMIN") {
      throw new ForbiddenException("Only ADMIN can delete seeded PRODUCT articles");
    }
    await this.prisma.helpArticle.delete({ where: { id } });
    return { ok: true };
  }

  async publishArticle(user: AuthUser, id: string) {
    const existing = await this.prisma.helpArticle.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Article not found");
    await this.assertWrite(user, existing.audience);
    await this.prisma.helpArticle.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        updatedById: user.id,
      },
    });
    return this.getArticleById(user, id);
  }

  async resetSeedArticle(user: AuthUser, id: string) {
    if (user.role !== "ADMIN") throw new ForbiddenException("Only ADMIN can reset seed articles");
    const existing = await this.prisma.helpArticle.findUnique({ where: { id } });
    if (!existing?.seedKey) throw new BadRequestException("Article has no seedKey");
    const seed = getSeedArticleByKey(existing.seedKey);
    if (!seed) throw new BadRequestException("Seed definition not found");

    await this.prisma.helpArticle.update({
      where: { id },
      data: {
        title: seed.title,
        excerpt: seed.excerpt,
        bodyMd: seed.bodyMd,
        sortOrder: seed.sortOrder,
        visibleRoles: jsonOrNull(seed.visibleRoles ?? null),
        seedRevision: seed.seedRevision ?? HELP_SEED_REVISION,
        updatedById: user.id,
      },
    });

    if (seed.bindings) {
      await this.upsertBindings(id, seed.bindings);
    }

    return this.getArticleById(user, id);
  }
}
