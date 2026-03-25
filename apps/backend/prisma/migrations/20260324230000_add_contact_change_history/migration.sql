CREATE TABLE "ContactChangeHistory" (
    "id" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "changedBy" TEXT,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContactChangeHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContactChangeHistory_contactId_idx" ON "ContactChangeHistory"("contactId");

CREATE INDEX "ContactChangeHistory_createdAt_idx" ON "ContactChangeHistory"("createdAt");

ALTER TABLE "ContactChangeHistory"
ADD CONSTRAINT "ContactChangeHistory_contactId_fkey"
FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
