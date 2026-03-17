import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { ActivityType } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { ActivitiesService } from "./activities.service";

type CreateBody = {
  type: ActivityType;
  title?: string;
  body: string;
  occurredAt?: string;
};

type UpdateActivityBody = {
  body?: string;
  title?: string;
  pinnedAt?: string | null;
};

@Controller()
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // -------- ORDER --------
  @Get("/orders/:id/activities")
  async listForOrder(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const items = await this.activitiesService.listForOrder(id, req.user);
    return { items };
  }

  @Post("/orders/:id/activities")
  async createForOrder(
    @Param("id") id: string,
    @Body() body: CreateBody,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) throw new BadRequestException("User not found in request");
    const item = await this.activitiesService.createForOrder(id, body, req.user);
    return { item };
  }

  // -------- CONTACT --------
  @Get("/contacts/:id/activities")
  async listForContact(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const items = await this.activitiesService.listForContact(id, req.user);
    return { items };
  }

  @Post("/contacts/:id/activities")
  async createForContact(
    @Param("id") id: string,
    @Body() body: CreateBody,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) throw new BadRequestException("User not found in request");
    const item = await this.activitiesService.createForContact(id, body, req.user);
    return { item };
  }

  // -------- LEAD --------
  @Get("/leads/:id/activities")
  async listForLead(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const items = await this.activitiesService.listForLead(id, req.user);
    return { items };
  }

  @Post("/leads/:id/activities")
  async createForLead(
    @Param("id") id: string,
    @Body() body: CreateBody,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) throw new BadRequestException("User not found in request");
    const item = await this.activitiesService.createForLead(id, body, req.user);
    return { item };
  }

  // -------- COMPANY --------
  @Get("/companies/:id/activities")
  async listForCompany(@Param("id") id: string) {
    const items = await this.activitiesService.listForCompany(id);
    return { items };
  }

  @Post("/companies/:id/activities")
  async createForCompany(
    @Param("id") id: string,
    @Body() body: CreateBody,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) throw new BadRequestException("User not found in request");
    const item = await this.activitiesService.createForCompany(id, body, req.user);
    return { item };
  }

  // -------- ACTIVITY BY ID (update / delete) --------
  @Patch("/activities/:id")
  async updateOne(
    @Param("id") id: string,
    @Body() body: UpdateActivityBody,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) throw new BadRequestException("User not found in request");
    const item = await this.activitiesService.updateOne(id, body, req.user);
    return { item };
  }

  @Delete("/activities/:id")
  async deleteOne(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    if (!req.user) throw new BadRequestException("User not found in request");
    await this.activitiesService.deleteOne(id, req.user);
    return { ok: true };
  }
}
