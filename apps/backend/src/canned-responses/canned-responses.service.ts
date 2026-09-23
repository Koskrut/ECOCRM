import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateCannedResponseDto,
  UpdateCannedResponseDto,
} from "../integrations/shared/inbox-actions.dto";

@Injectable()
export class CannedResponsesService {
  constructor(private readonly prisma: PrismaService) {}

  private requireActor(actor: AuthUser | undefined): AuthUser {
    if (!actor) throw new ForbiddenException("Authentication required");
    return actor;
  }

  private assertLeadOrAdmin(actor: AuthUser) {
    if (actor.role !== UserRole.LEAD && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException("Only leads and admins can manage templates");
    }
  }

  private normalizeShortcut(shortcut: string | null | undefined): string | null {
    if (shortcut == null) return null;
    const cleaned = shortcut.trim().replace(/^\/+/, "").toLowerCase();
    return cleaned || null;
  }

  async list() {
    const items = await this.prisma.cannedResponse.findMany({
      orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    return { items };
  }

  async create(dto: CreateCannedResponseDto, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);
    this.assertLeadOrAdmin(safeActor);

    const title = String(dto.title ?? "").trim();
    const body = String(dto.body ?? "").trim();
    if (!title || !body) {
      throw new BadRequestException("Title and body are required");
    }

    return this.prisma.cannedResponse.create({
      data: {
        title,
        body,
        shortcut: this.normalizeShortcut(dto.shortcut),
        sortOrder: dto.sortOrder ?? 0,
        createdById: safeActor.id,
      },
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async update(id: string, dto: UpdateCannedResponseDto, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);
    this.assertLeadOrAdmin(safeActor);

    const existing = await this.prisma.cannedResponse.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Template not found");

    const data: {
      title?: string;
      body?: string;
      shortcut?: string | null;
      sortOrder?: number;
    } = {};
    if (dto.title !== undefined) {
      const title = String(dto.title).trim();
      if (!title) throw new BadRequestException("Title cannot be empty");
      data.title = title;
    }
    if (dto.body !== undefined) {
      const body = String(dto.body).trim();
      if (!body) throw new BadRequestException("Body cannot be empty");
      data.body = body;
    }
    if (dto.shortcut !== undefined) {
      data.shortcut = this.normalizeShortcut(dto.shortcut);
    }
    if (dto.sortOrder !== undefined) {
      data.sortOrder = dto.sortOrder;
    }

    return this.prisma.cannedResponse.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, fullName: true } },
      },
    });
  }

  async remove(id: string, actor: AuthUser | undefined) {
    const safeActor = this.requireActor(actor);
    this.assertLeadOrAdmin(safeActor);

    const existing = await this.prisma.cannedResponse.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("Template not found");

    await this.prisma.cannedResponse.delete({ where: { id } });
    return { ok: true };
  }
}
