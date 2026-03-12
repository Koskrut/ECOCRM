-- CreateTable
CREATE TABLE "OrderNumberSeq" (
    "id" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL,
    CONSTRAINT "OrderNumberSeq_pkey" PRIMARY KEY ("id")
);

-- Seed single row: next order number starts at 7000
INSERT INTO "OrderNumberSeq" ("id", "nextValue") VALUES (gen_random_uuid()::text, 7000);
