-- AlterEnum: add CONVERTED to LeadEventType (idempotent for repeated applies).
ALTER TYPE "LeadEventType" ADD VALUE IF NOT EXISTS 'CONVERTED';
