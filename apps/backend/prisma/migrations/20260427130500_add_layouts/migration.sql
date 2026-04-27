CREATE TYPE "LayoutType" AS ENUM ('FORM', 'CARD', 'TABLE', 'FILTERS');

CREATE TABLE "LayoutDefinition" (
    "id" TEXT NOT NULL,
    "entityType" "CustomFieldEntityType" NOT NULL,
    "type" "LayoutType" NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LayoutDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LayoutSection" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "columns" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LayoutSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LayoutField" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fieldKey" TEXT,
    "customFieldDefinitionId" TEXT,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "readonly" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "width" INTEGER,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "LayoutField_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LayoutDefinition_entityType_type_key_key" ON "LayoutDefinition"("entityType", "type", "key");
CREATE INDEX "LayoutDefinition_entityType_type_isActive_idx" ON "LayoutDefinition"("entityType", "type", "isActive");
CREATE INDEX "LayoutDefinition_isDefault_idx" ON "LayoutDefinition"("isDefault");
CREATE INDEX "LayoutDefinition_deletedAt_idx" ON "LayoutDefinition"("deletedAt");

CREATE UNIQUE INDEX "LayoutSection_layoutId_key_key" ON "LayoutSection"("layoutId", "key");
CREATE INDEX "LayoutSection_layoutId_sortOrder_idx" ON "LayoutSection"("layoutId", "sortOrder");
CREATE INDEX "LayoutSection_layoutId_isActive_idx" ON "LayoutSection"("layoutId", "isActive");
CREATE INDEX "LayoutSection_deletedAt_idx" ON "LayoutSection"("deletedAt");

CREATE UNIQUE INDEX "LayoutField_sectionId_key_key" ON "LayoutField"("sectionId", "key");
CREATE INDEX "LayoutField_sectionId_sortOrder_idx" ON "LayoutField"("sectionId", "sortOrder");
CREATE INDEX "LayoutField_customFieldDefinitionId_idx" ON "LayoutField"("customFieldDefinitionId");
CREATE INDEX "LayoutField_deletedAt_idx" ON "LayoutField"("deletedAt");

ALTER TABLE "LayoutSection"
    ADD CONSTRAINT "LayoutSection_layoutId_fkey"
    FOREIGN KEY ("layoutId") REFERENCES "LayoutDefinition"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LayoutField"
    ADD CONSTRAINT "LayoutField_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "LayoutSection"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LayoutField"
    ADD CONSTRAINT "LayoutField_customFieldDefinitionId_fkey"
    FOREIGN KEY ("customFieldDefinitionId") REFERENCES "CustomFieldDefinition"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
