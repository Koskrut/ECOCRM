CREATE TYPE "CustomFieldEntityType" AS ENUM ('CONTACT', 'COMPANY', 'LEAD', 'ORDER', 'PRODUCT');

CREATE TYPE "CustomFieldType" AS ENUM (
    'TEXT',
    'NUMBER',
    'MONEY',
    'DATE',
    'BOOLEAN',
    'SELECT',
    'MULTISELECT',
    'USER',
    'DICTIONARY_ITEM',
    'JSON'
);

CREATE TABLE "CustomFieldDefinition" (
    "id" TEXT NOT NULL,
    "entityType" "CustomFieldEntityType" NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "type" "CustomFieldType" NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "dictionaryId" TEXT,
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomFieldDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomFieldOption" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomFieldOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomFieldValue" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "entityType" "CustomFieldEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "valueString" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "valueBoolean" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "valueJson" JSONB,
    "dictionaryItemId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CustomFieldDefinition_entityType_key_key" ON "CustomFieldDefinition"("entityType", "key");
CREATE INDEX "CustomFieldDefinition_entityType_isActive_idx" ON "CustomFieldDefinition"("entityType", "isActive");
CREATE INDEX "CustomFieldDefinition_dictionaryId_idx" ON "CustomFieldDefinition"("dictionaryId");
CREATE INDEX "CustomFieldDefinition_deletedAt_idx" ON "CustomFieldDefinition"("deletedAt");

CREATE UNIQUE INDEX "CustomFieldOption_definitionId_key_key" ON "CustomFieldOption"("definitionId", "key");
CREATE INDEX "CustomFieldOption_definitionId_sortOrder_idx" ON "CustomFieldOption"("definitionId", "sortOrder");
CREATE INDEX "CustomFieldOption_definitionId_isActive_idx" ON "CustomFieldOption"("definitionId", "isActive");
CREATE INDEX "CustomFieldOption_deletedAt_idx" ON "CustomFieldOption"("deletedAt");

CREATE UNIQUE INDEX "CustomFieldValue_definitionId_entityId_key" ON "CustomFieldValue"("definitionId", "entityId");
CREATE INDEX "CustomFieldValue_entityType_entityId_idx" ON "CustomFieldValue"("entityType", "entityId");
CREATE INDEX "CustomFieldValue_definitionId_valueString_idx" ON "CustomFieldValue"("definitionId", "valueString");
CREATE INDEX "CustomFieldValue_definitionId_valueNumber_idx" ON "CustomFieldValue"("definitionId", "valueNumber");
CREATE INDEX "CustomFieldValue_definitionId_valueBoolean_idx" ON "CustomFieldValue"("definitionId", "valueBoolean");
CREATE INDEX "CustomFieldValue_definitionId_valueDate_idx" ON "CustomFieldValue"("definitionId", "valueDate");
CREATE INDEX "CustomFieldValue_dictionaryItemId_idx" ON "CustomFieldValue"("dictionaryItemId");

ALTER TABLE "CustomFieldDefinition"
    ADD CONSTRAINT "CustomFieldDefinition_dictionaryId_fkey"
    FOREIGN KEY ("dictionaryId") REFERENCES "Dictionary"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CustomFieldOption"
    ADD CONSTRAINT "CustomFieldOption_definitionId_fkey"
    FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomFieldValue"
    ADD CONSTRAINT "CustomFieldValue_definitionId_fkey"
    FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomFieldValue"
    ADD CONSTRAINT "CustomFieldValue_dictionaryItemId_fkey"
    FOREIGN KEY ("dictionaryItemId") REFERENCES "DictionaryItem"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
