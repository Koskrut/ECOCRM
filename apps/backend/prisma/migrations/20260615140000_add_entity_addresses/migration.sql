-- CreateTable
CREATE TABLE "ContactAddress" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "label" TEXT,
    "city" TEXT,
    "addressText" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "googlePlaceId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "legacySource" TEXT,
    "legacyId" INTEGER,
    "legacyRaw" JSONB,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAddress" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "label" TEXT,
    "city" TEXT,
    "addressText" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "googlePlaceId" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "legacySource" TEXT,
    "legacyId" INTEGER,
    "legacyRaw" JSONB,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAddress_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Visit" ADD COLUMN "contactAddressId" TEXT,
ADD COLUMN "companyAddressId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ContactAddress_legacySource_legacyId_key" ON "ContactAddress"("legacySource", "legacyId");

-- CreateIndex
CREATE INDEX "ContactAddress_contactId_idx" ON "ContactAddress"("contactId");

-- CreateIndex
CREATE INDEX "ContactAddress_contactId_isDefault_idx" ON "ContactAddress"("contactId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAddress_legacySource_legacyId_key" ON "CompanyAddress"("legacySource", "legacyId");

-- CreateIndex
CREATE INDEX "CompanyAddress_companyId_idx" ON "CompanyAddress"("companyId");

-- CreateIndex
CREATE INDEX "CompanyAddress_companyId_isDefault_idx" ON "CompanyAddress"("companyId", "isDefault");

-- CreateIndex
CREATE INDEX "Visit_contactAddressId_idx" ON "Visit"("contactAddressId");

-- CreateIndex
CREATE INDEX "Visit_companyAddressId_idx" ON "Visit"("companyAddressId");

-- AddForeignKey
ALTER TABLE "ContactAddress" ADD CONSTRAINT "ContactAddress_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAddress" ADD CONSTRAINT "CompanyAddress_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_contactAddressId_fkey" FOREIGN KEY ("contactAddressId") REFERENCES "ContactAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Visit" ADD CONSTRAINT "Visit_companyAddressId_fkey" FOREIGN KEY ("companyAddressId") REFERENCES "CompanyAddress"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill ContactAddress: geocoded primary address
INSERT INTO "ContactAddress" (
    "id", "contactId", "label", "city", "addressText", "lat", "lng", "googlePlaceId", "isDefault", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    c."id",
    NULL,
    NULLIF(TRIM(c."city"), ''),
    TRIM(c."address"),
    c."lat",
    c."lng",
    c."googlePlaceId",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Contact" c
WHERE c."address" IS NOT NULL AND TRIM(c."address") <> '';

-- Backfill ContactAddress: addressInfo as separate or default record
INSERT INTO "ContactAddress" (
    "id", "contactId", "label", "city", "addressText", "lat", "lng", "googlePlaceId", "isDefault", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    c."id",
    NULL,
    NULLIF(TRIM(c."city"), ''),
    TRIM(c."addressInfo"),
    NULL,
    NULL,
    NULL,
    NOT EXISTS (
        SELECT 1 FROM "ContactAddress" ca WHERE ca."contactId" = c."id" AND ca."isDefault" = true
    ),
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Contact" c
WHERE c."addressInfo" IS NOT NULL
  AND TRIM(c."addressInfo") <> ''
  AND (
    c."address" IS NULL
    OR TRIM(c."address") = ''
    OR TRIM(c."addressInfo") <> TRIM(c."address")
  );

-- Backfill ContactAddress: city-only when no other address data
INSERT INTO "ContactAddress" (
    "id", "contactId", "label", "city", "addressText", "lat", "lng", "googlePlaceId", "isDefault", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    c."id",
    NULL,
    NULLIF(TRIM(c."city"), ''),
    NULLIF(TRIM(c."city"), ''),
    NULL,
    NULL,
    NULL,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Contact" c
WHERE c."city" IS NOT NULL
  AND TRIM(c."city") <> ''
  AND NOT EXISTS (SELECT 1 FROM "ContactAddress" ca WHERE ca."contactId" = c."id");

-- Backfill CompanyAddress from company.address
INSERT INTO "CompanyAddress" (
    "id", "companyId", "label", "city", "addressText", "lat", "lng", "googlePlaceId", "isDefault", "createdAt", "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    co."id",
    NULL,
    NULL,
    TRIM(co."address"),
    co."lat",
    co."lng",
    co."googlePlaceId",
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Company" co
WHERE co."address" IS NOT NULL AND TRIM(co."address") <> '';
