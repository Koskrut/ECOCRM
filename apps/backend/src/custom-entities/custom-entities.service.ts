import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class CustomEntitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async listDefinitions() {
    const items = await this.prisma.customEntityDefinition.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
    });
    return { items };
  }

  async createDefinition(body: { key: string; name: string; pluralName?: string | null; description?: string | null }) {
    const key = body.key.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key) throw new BadRequestException("key is required");
    const name = body.name.trim();
    if (!name) throw new BadRequestException("name is required");
    const def = await this.prisma.customEntityDefinition.create({
      data: {
        key,
        name,
        pluralName: body.pluralName?.trim() || null,
        description: body.description?.trim() || null,
      },
    });
    return { definition: def };
  }

  async listRecords(definitionKey: string) {
    const def = await this.prisma.customEntityDefinition.findFirst({
      where: { key: definitionKey, deletedAt: null },
    });
    if (!def) throw new NotFoundException("Definition not found");
    const items = await this.prisma.customEntityRecord.findMany({
      where: { definitionId: def.id },
      orderBy: { updatedAt: "desc" },
    });
    return { definition: def, items };
  }

  async createRecord(definitionKey: string, body: { data?: Record<string, unknown> }) {
    const def = await this.prisma.customEntityDefinition.findFirst({
      where: { key: definitionKey, deletedAt: null, isActive: true },
    });
    if (!def) throw new NotFoundException("Definition not found");
    const data = (body.data ?? {}) as object;
    const rec = await this.prisma.customEntityRecord.create({
      data: { definitionId: def.id, data },
    });
    return { record: rec };
  }

  async updateRecord(recordId: string, body: { data: Record<string, unknown> }) {
    const existing = await this.prisma.customEntityRecord.findUnique({ where: { id: recordId } });
    if (!existing) throw new NotFoundException("Record not found");
    const rec = await this.prisma.customEntityRecord.update({
      where: { id: recordId },
      data: { data: body.data as object },
    });
    return { record: rec };
  }
}
