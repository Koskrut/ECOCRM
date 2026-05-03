-- CreateTable
CREATE TABLE "DataImportJob" (
    "id" TEXT NOT NULL,
    "targetEntity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "fileName" TEXT,
    "summary" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DataImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomEntityDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "pluralName" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CustomEntityDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomEntityRecord" (
    "id" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomEntityRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DataImportJob_createdById_idx" ON "DataImportJob"("createdById");

-- CreateIndex
CREATE INDEX "DataImportJob_status_idx" ON "DataImportJob"("status");

-- CreateIndex
CREATE INDEX "DataImportJob_targetEntity_idx" ON "DataImportJob"("targetEntity");

-- CreateIndex
CREATE UNIQUE INDEX "CustomEntityDefinition_key_key" ON "CustomEntityDefinition"("key");

-- CreateIndex
CREATE INDEX "CustomEntityDefinition_isActive_idx" ON "CustomEntityDefinition"("isActive");

-- CreateIndex
CREATE INDEX "CustomEntityDefinition_deletedAt_idx" ON "CustomEntityDefinition"("deletedAt");

-- CreateIndex
CREATE INDEX "CustomEntityRecord_definitionId_idx" ON "CustomEntityRecord"("definitionId");

-- AddForeignKey
ALTER TABLE "DataImportJob" ADD CONSTRAINT "DataImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomEntityRecord" ADD CONSTRAINT "CustomEntityRecord_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomEntityDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
