import type { HelpArticleStatus, HelpAudience } from "@prisma/client";

export type HelpCategoryDto = {
  key: string;
  title: string;
  audience: HelpAudience;
  sortOrder?: number;
  icon?: string | null;
};

export type HelpArticleBindingDto = {
  routeKey?: string | null;
  entityType?: string | null;
  sortOrder?: number;
};

export type HelpArticleDto = {
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
  bindings?: HelpArticleBindingDto[];
};

export type HelpArticleListQuery = {
  q?: string;
  audience?: HelpAudience;
  categoryKey?: string;
  routeKey?: string;
  entityType?: string;
  includeDrafts?: boolean;
};

export type HelpContextQuery = {
  routeKey?: string;
  entityType?: string;
};
