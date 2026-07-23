import { apiDelete, apiGet, apiPatch, apiPost } from "../client";

export type HelpAudience = "PRODUCT" | "BUSINESS";
export type HelpArticleStatus = "DRAFT" | "PUBLISHED";

export type HelpCategory = {
  id: string;
  key: string;
  title: string;
  audience: HelpAudience;
  sortOrder: number;
  icon: string | null;
  articleCount?: number;
};

export type HelpArticleBinding = {
  id?: string;
  routeKey?: string | null;
  entityType?: string | null;
  sortOrder?: number;
};

export type HelpArticleSummary = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  audience: HelpAudience;
  category: { key: string; title: string } | null;
};

export type HelpArticle = {
  id: string;
  slug: string;
  seedKey: string | null;
  categoryId: string;
  category: {
    id: string;
    key: string;
    title: string;
    audience: HelpAudience;
  } | null;
  audience: HelpAudience;
  status: HelpArticleStatus;
  locale: string;
  title: string;
  excerpt: string | null;
  bodyMd: string;
  sortOrder: number;
  visibleRoles: string[] | null;
  bindings: HelpArticleBinding[];
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  seedRevision: number | null;
};

export type HelpArticleInput = {
  categoryKey: string;
  slug?: string;
  audience: HelpAudience;
  status?: HelpArticleStatus;
  locale?: string;
  title: string;
  excerpt?: string | null;
  bodyMd: string;
  sortOrder?: number;
  visibleRoles?: string[] | null;
  bindings?: HelpArticleBinding[];
};

export const helpApi = {
  listCategories(audience?: HelpAudience) {
    return apiGet<{ items?: HelpCategory[] } | HelpCategory[]>("help/categories", audience ? { audience } : undefined).then(
      normalizeCategories,
    );
  },

  listArticles(params?: {
    q?: string;
    audience?: HelpAudience;
    categoryKey?: string;
    routeKey?: string;
    entityType?: string;
    includeDrafts?: boolean;
  }) {
    return apiGet<{ items: HelpArticle[] }>("help/articles", params);
  },

  getContext(params: { routeKey?: string; entityType?: string }) {
    return apiGet<{ items: HelpArticleSummary[] }>("help/context", params);
  },

  getBySlug(slug: string) {
    return apiGet<HelpArticle>(`help/article/${encodeURIComponent(slug)}`);
  },

  getById(id: string) {
    return apiGet<HelpArticle>(`help/articles/${encodeURIComponent(id)}`);
  },

  createArticle(body: HelpArticleInput) {
    return apiPost<HelpArticle>("help/articles", body);
  },

  updateArticle(id: string, body: Partial<HelpArticleInput>) {
    return apiPatch<HelpArticle>(`help/articles/${encodeURIComponent(id)}`, body);
  },

  deleteArticle(id: string) {
    return apiDelete<{ ok: boolean }>(`help/articles/${encodeURIComponent(id)}`);
  },

  publishArticle(id: string) {
    return apiPost<HelpArticle>(`help/articles/${encodeURIComponent(id)}/publish`);
  },

  resetSeed(id: string) {
    return apiPost<HelpArticle>(`help/articles/${encodeURIComponent(id)}/reset-seed`);
  },

  syncSeed() {
    return apiPost<{ created: number; updated: number; skipped: number }>("help/admin/sync-seed");
  },

  createCategory(body: { key: string; title: string; audience: HelpAudience; sortOrder?: number; icon?: string | null }) {
    return apiPost<HelpCategory>("help/categories", body);
  },
};

function normalizeCategories(data: { items?: HelpCategory[] } | HelpCategory[]): HelpCategory[] {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}
