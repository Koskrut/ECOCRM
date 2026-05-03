-- Workflow + metadata entity coverage for tasks and timeline activities.
ALTER TYPE "CustomFieldEntityType" ADD VALUE IF NOT EXISTS 'TASK';
ALTER TYPE "CustomFieldEntityType" ADD VALUE IF NOT EXISTS 'ACTIVITY';
