import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

export const BITRIX_INTEGRATION = "bitrix";

export type SyncState = {
  id: string;
  integration: string;
  entity: string;
  lastSyncAt: Date | null;
  lastCursor: string | null;
  lastRunAt: Date | null;
  status: string | null;
  error: string | null;
};

@Injectable()
export class BitrixSyncStateService {
  constructor(private readonly prisma: PrismaService) {}

  async getState(integration: string, entity: string): Promise<SyncState | null> {
    const row = await this.prisma.integrationSyncState.findUnique({
      where: {
        integration_entity: { integration, entity },
      },
    });
    return row;
  }

  async setLastSync(
    integration: string,
    entity: string,
    lastSyncAt: Date,
    lastCursor?: string | null,
  ): Promise<void> {
    await this.prisma.integrationSyncState.upsert({
      where: { integration_entity: { integration, entity } },
      create: {
        integration,
        entity,
        lastSyncAt,
        lastCursor: lastCursor ?? null,
        lastRunAt: new Date(),
        status: "ok",
        error: null,
      },
      update: {
        lastSyncAt,
        lastCursor: lastCursor ?? undefined,
        lastRunAt: new Date(),
        status: "ok",
        error: null,
      },
    });
  }

  async setError(integration: string, entity: string, error: string): Promise<void> {
    await this.prisma.integrationSyncState.upsert({
      where: { integration_entity: { integration, entity } },
      create: {
        integration,
        entity,
        lastRunAt: new Date(),
        status: "error",
        error,
      },
      update: {
        lastRunAt: new Date(),
        status: "error",
        error,
      },
    });
  }

  async setStatus(integration: string, entity: string, status: string): Promise<void> {
    await this.prisma.integrationSyncState.upsert({
      where: { integration_entity: { integration, entity } },
      create: {
        integration,
        entity,
        lastRunAt: new Date(),
        status,
      },
      update: {
        lastRunAt: new Date(),
        status,
      },
    });
  }
}
