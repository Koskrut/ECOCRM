import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { TaskStatus } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { TasksService } from "./tasks.service";

@Controller("tasks")
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  async list(
    @Query("assigneeId") assigneeId?: string,
    @Query("contactId") contactId?: string,
    @Query("companyId") companyId?: string,
    @Query("leadId") leadId?: string,
    @Query("orderId") orderId?: string,
    @Query("status") status?: string,
    @Query("dueFrom") dueFrom?: string,
    @Query("dueTo") dueTo?: string,
    @Query("sortBy") sortBy?: string,
    @Query("sortDir") sortDir?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
    @Req() req?: Request & { user?: AuthUser },
  ) {
    const statusParsed =
      status != null && status !== ""
        ? (status.includes(",") ? status.split(",") : status) as TaskStatus | TaskStatus[]
        : undefined;
    const sortByValid = sortBy === "dueAt" || sortBy === "createdAt" || sortBy === "updatedAt" ? sortBy : undefined;
    const sortDirValid = sortDir === "asc" || sortDir === "desc" ? sortDir : undefined;
    return this.tasks.list(
      {
        assigneeId: assigneeId ?? undefined,
        contactId: contactId ?? undefined,
        companyId: companyId ?? undefined,
        leadId: leadId ?? undefined,
        orderId: orderId ?? undefined,
        status: statusParsed,
        dueFrom: dueFrom ?? undefined,
        dueTo: dueTo ?? undefined,
        sortBy: sortByValid,
        sortDir: sortDirValid,
        page: page != null ? Number(page) : undefined,
        pageSize: pageSize != null ? Number(pageSize) : undefined,
      },
      req?.user,
    );
  }

  @Post()
  async create(
    @Body() body: Record<string, unknown>,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) {
      throw new BadRequestException("User is required");
    }
    const dueAt = body.dueAt != null ? String(body.dueAt) : undefined;
    return this.tasks.create(
      {
        title: String(body.title ?? ""),
        body: body.body != null ? String(body.body) : undefined,
        dueAt: dueAt && dueAt !== "" ? dueAt : undefined,
        contactId: body.contactId != null ? (body.contactId as string) : undefined,
        companyId: body.companyId != null ? (body.companyId as string) : undefined,
        leadId: body.leadId != null ? (body.leadId as string) : undefined,
        orderId: body.orderId != null ? (body.orderId as string) : undefined,
        assigneeId: body.assigneeId != null ? (body.assigneeId as string) : undefined,
      },
      req.user,
    );
  }

  @Get(":id")
  async getOne(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.tasks.getOne(id, req?.user);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) {
      throw new BadRequestException("User is required");
    }
    const dueAt = body.dueAt !== undefined ? (body.dueAt != null ? String(body.dueAt) : null) : undefined;
    return this.tasks.update(
      id,
      {
        title: body.title !== undefined ? String(body.title) : undefined,
        body: body.body !== undefined ? (body.body != null ? String(body.body) : null) : undefined,
        dueAt,
        status: body.status !== undefined ? (body.status as TaskStatus) : undefined,
      },
      req.user,
    );
  }

  @Post(":id/complete")
  async complete(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.tasks.complete(id, req?.user);
  }

  @Post(":id/cancel")
  async cancel(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.tasks.cancel(id, req?.user);
  }
}
