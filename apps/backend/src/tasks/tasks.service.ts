import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma, TaskStatus } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { ContactAccessService } from "../contacts/contact-access.service";
import { PrismaService } from "../prisma/prisma.service";
import type { CreateTaskDto } from "./dto/create-task.dto";
import type { ListTasksQueryDto } from "./dto/list-tasks-query.dto";
import type { UpdateTaskDto } from "./dto/update-task.dto";

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly contactAccess: ContactAccessService,
  ) {}

  private async assertTaskAccess(
    task: { assigneeId: string; createdById: string | null },
    actor: AuthUser,
  ): Promise<void> {
    if (actor.role === UserRole.ADMIN) {
      return;
    }
    if (actor.role === UserRole.MANAGER) {
      if (task.assigneeId !== actor.id && task.createdById !== actor.id) {
        throw new ForbiddenException("You can only access your own tasks");
      }
      return;
    }
    if (actor.role === UserRole.LEAD) {
      const team = await this.contactAccess.getTeamUserIds(actor.id);
      if (!team.includes(task.assigneeId)) {
        throw new ForbiddenException("You can only access tasks assigned to your team");
      }
      return;
    }
    throw new ForbiddenException("Insufficient permissions");
  }

  private async assertEntityAccess(
    actor: AuthUser,
    opts: { contactId?: string | null; companyId?: string | null; leadId?: string | null; orderId?: string | null },
  ): Promise<void> {
    if (opts.contactId) {
      const contact = await this.prisma.contact.findUnique({
        where: { id: opts.contactId },
        select: { id: true, ownerId: true },
      });
      if (!contact) throw new NotFoundException("Contact not found");
      await this.contactAccess.assertCanViewContact(contact, actor);
    }
    if (opts.leadId) {
      const lead = await this.prisma.lead.findUnique({
        where: { id: opts.leadId },
        select: { ownerId: true },
      });
      if (!lead) throw new NotFoundException("Lead not found");
      if (actor.role === UserRole.MANAGER && lead.ownerId != null && lead.ownerId !== actor.id) {
        throw new ForbiddenException("You can only create tasks for leads assigned to you");
      }
    }
    if (opts.orderId) {
      const order = await this.prisma.order.findUnique({
        where: { id: opts.orderId },
        select: { ownerId: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (actor.role === UserRole.MANAGER && order.ownerId !== actor.id) {
        throw new ForbiddenException("You can only create tasks for orders assigned to you");
      }
    }
    // company: no ownership, any authenticated user can link
  }

  async create(body: CreateTaskDto, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const contactId = body.contactId ?? null;
    const companyId = body.companyId ?? null;
    const leadId = body.leadId ?? null;
    const orderId = body.orderId ?? null;
    if (!contactId && !companyId && !leadId && !orderId) {
      throw new BadRequestException("At least one of contactId, companyId, leadId, orderId is required");
    }
    await this.assertEntityAccess(actor, { contactId, companyId, leadId, orderId });

    const assigneeId =
      body.assigneeId != null && actor.role === UserRole.ADMIN ? body.assigneeId : actor.id;
    const dueAt =
      typeof body.dueAt === "string" && body.dueAt
        ? new Date(body.dueAt)
        : undefined;

    const task = await this.prisma.task.create({
      data: {
        assigneeId,
        createdById: actor.id,
        contactId,
        companyId,
        leadId,
        orderId,
        title: body.title.trim(),
        body: body.body?.trim() ?? null,
        dueAt: dueAt ?? null,
      },
    });
    return task;
  }

  async list(query: ListTasksQueryDto, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const where: Prisma.TaskWhereInput = {};
    if (actor.role === UserRole.MANAGER) {
      if (query.contactId) {
        where.OR = [{ assigneeId: actor.id }, { createdById: actor.id }];
      } else {
        where.assigneeId = actor.id;
      }
    } else if (actor.role === UserRole.LEAD && query.contactId) {
      const team = await this.contactAccess.getTeamUserIds(actor.id);
      where.assigneeId = { in: team };
    } else if (query.assigneeId) {
      where.assigneeId = query.assigneeId;
    }
    if (query.contactId) where.contactId = query.contactId;
    if (query.companyId) where.companyId = query.companyId;
    if (query.leadId) where.leadId = query.leadId;
    if (query.orderId) where.orderId = query.orderId;
    if (query.status != null) {
      if (Array.isArray(query.status)) {
        where.status = { in: query.status };
      } else {
        where.status = query.status as TaskStatus;
      }
    }
    if (query.dueFrom || query.dueTo) {
      where.dueAt = {};
      if (query.dueFrom) {
        (where.dueAt as Prisma.DateTimeNullableFilter).gte = new Date(query.dueFrom);
      }
      if (query.dueTo) {
        (where.dueAt as Prisma.DateTimeNullableFilter).lte = new Date(query.dueTo);
      }
    }

    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 50));
    const skip = (page - 1) * pageSize;

    const sortBy = query.sortBy === "createdAt" || query.sortBy === "updatedAt" ? query.sortBy : "dueAt";
    const sortDir = query.sortDir === "asc" || query.sortDir === "desc" ? query.sortDir : "asc";
    const orderBy: Prisma.TaskOrderByWithRelationInput[] = [
      { [sortBy]: sortDir },
      { id: "asc" },
    ];

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy,
        skip,
        take: pageSize,
        include: {
          assignee: { select: { id: true, fullName: true } },
        },
      }),
      this.prisma.task.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async getOne(id: string, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const task = await this.prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, fullName: true } },
      },
    });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    await this.assertTaskAccess(task, actor);
    return task;
  }

  async update(id: string, body: UpdateTaskDto, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    await this.assertTaskAccess(task, actor);

    const dueAt =
      body.dueAt !== undefined
        ? (typeof body.dueAt === "string" && body.dueAt ? new Date(body.dueAt) : null)
        : undefined;

    return this.prisma.task.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title.trim() }),
        ...(body.body !== undefined && { body: body.body?.trim() ?? null }),
        ...(dueAt !== undefined && { dueAt }),
        ...(body.status !== undefined && { status: body.status }),
        ...(body.status === "DONE" && { completedAt: new Date() }),
        ...(body.status !== "DONE" && body.status !== undefined && { completedAt: null }),
      },
    });
  }

  async complete(id: string, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    await this.assertTaskAccess(task, actor);
    return this.prisma.task.update({
      where: { id },
      data: { status: "DONE", completedAt: new Date() },
    });
  }

  async cancel(id: string, actor: AuthUser | undefined) {
    if (!actor) {
      throw new BadRequestException("User is required");
    }
    const task = await this.prisma.task.findUnique({ where: { id } });
    if (!task) {
      throw new NotFoundException("Task not found");
    }
    await this.assertTaskAccess(task, actor);
    return this.prisma.task.update({
      where: { id },
      data: { status: "CANCELED" },
    });
  }
}
