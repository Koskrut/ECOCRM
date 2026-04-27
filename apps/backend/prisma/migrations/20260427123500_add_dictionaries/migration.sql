-- Metadata dictionaries used by configurable fields, layouts, and workflow conditions.
CREATE TABLE "Dictionary" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Dictionary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DictionaryItem" (
    "id" TEXT NOT NULL,
    "dictionaryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "DictionaryItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Dictionary_key_key" ON "Dictionary"("key");
CREATE INDEX "Dictionary_system_idx" ON "Dictionary"("system");
CREATE INDEX "Dictionary_isActive_idx" ON "Dictionary"("isActive");
CREATE INDEX "Dictionary_deletedAt_idx" ON "Dictionary"("deletedAt");

CREATE UNIQUE INDEX "DictionaryItem_dictionaryId_key_key" ON "DictionaryItem"("dictionaryId", "key");
CREATE INDEX "DictionaryItem_dictionaryId_sortOrder_idx" ON "DictionaryItem"("dictionaryId", "sortOrder");
CREATE INDEX "DictionaryItem_dictionaryId_isActive_idx" ON "DictionaryItem"("dictionaryId", "isActive");
CREATE INDEX "DictionaryItem_deletedAt_idx" ON "DictionaryItem"("deletedAt");

ALTER TABLE "DictionaryItem"
    ADD CONSTRAINT "DictionaryItem_dictionaryId_fkey"
    FOREIGN KEY ("dictionaryId") REFERENCES "Dictionary"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
