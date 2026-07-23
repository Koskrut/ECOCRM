-- CreateEnum
CREATE TYPE "HelpAudience" AS ENUM ('PRODUCT', 'BUSINESS');

-- CreateEnum
CREATE TYPE "HelpArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

-- CreateTable
CREATE TABLE "HelpCategory" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "audience" "HelpAudience" NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpArticle" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "seedKey" TEXT,
    "categoryId" TEXT NOT NULL,
    "audience" "HelpAudience" NOT NULL,
    "status" "HelpArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "locale" TEXT NOT NULL DEFAULT 'uk',
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "bodyMd" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visibleRoles" JSONB,
    "createdById" TEXT,
    "updatedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpArticle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpArticleBinding" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "routeKey" TEXT,
    "entityType" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "HelpArticleBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HelpCategory_key_key" ON "HelpCategory"("key");

-- CreateIndex
CREATE INDEX "HelpCategory_audience_sortOrder_idx" ON "HelpCategory"("audience", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "HelpArticle_slug_key" ON "HelpArticle"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "HelpArticle_seedKey_key" ON "HelpArticle"("seedKey");

-- CreateIndex
CREATE INDEX "HelpArticle_audience_status_idx" ON "HelpArticle"("audience", "status");

-- CreateIndex
CREATE INDEX "HelpArticle_categoryId_sortOrder_idx" ON "HelpArticle"("categoryId", "sortOrder");

-- CreateIndex
CREATE INDEX "HelpArticleBinding_routeKey_idx" ON "HelpArticleBinding"("routeKey");

-- CreateIndex
CREATE INDEX "HelpArticleBinding_entityType_idx" ON "HelpArticleBinding"("entityType");

-- CreateIndex
CREATE INDEX "HelpArticleBinding_articleId_sortOrder_idx" ON "HelpArticleBinding"("articleId", "sortOrder");

-- AddForeignKey
ALTER TABLE "HelpArticle" ADD CONSTRAINT "HelpArticle_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "HelpCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HelpArticleBinding" ADD CONSTRAINT "HelpArticleBinding_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "HelpArticle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
