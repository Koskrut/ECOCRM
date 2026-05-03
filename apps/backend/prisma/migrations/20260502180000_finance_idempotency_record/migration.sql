-- Finance POST idempotency (Idempotency-Key header); see FinanceIdempotencyInterceptor.
CREATE TABLE "FinanceIdempotencyRecord" (
    "id" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "httpMethod" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "bodySha256" TEXT NOT NULL,
    "responseStatus" INTEGER NOT NULL,
    "responseBody" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceIdempotencyRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FinanceIdempotencyRecord_idempotencyKey_key" ON "FinanceIdempotencyRecord"("idempotencyKey");

CREATE INDEX "FinanceIdempotencyRecord_createdAt_idx" ON "FinanceIdempotencyRecord"("createdAt");
