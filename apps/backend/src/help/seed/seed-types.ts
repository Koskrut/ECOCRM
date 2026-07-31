import type { HelpArticleStatus, HelpAudience } from "@prisma/client";
import type { HelpArticleBindingDto } from "../dto/help.dto";

export type HelpSeedCategory = {
  key: string;
  title: string;
  audience: HelpAudience;
  sortOrder: number;
  icon?: string;
};

export type HelpSeedArticle = {
  seedKey: string;
  categoryKey: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyMd: string;
  status: HelpArticleStatus;
  sortOrder: number;
  visibleRoles?: string[] | null;
  bindings?: HelpArticleBindingDto[];
  seedRevision?: number;
};

export const HELP_SEED_REVISION = 3;
