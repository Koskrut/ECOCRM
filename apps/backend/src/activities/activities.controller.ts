import { BadRequestException, Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import { ActivityType } from "@prisma/client";
import { Request } from "express";
import { AuthUser } from "../auth/auth.types";
import { ActivitiesService } from "./activities.service";

type CreateBody = {
  type: ActivityType;
  title?: string;
  body: string;
  occurredAt?: string;
};

@Controller()
export class ActivitiesController {
  constructor(private readonly activitiesService: ActivitiesService) {}

  // -------- ORDER --------
  @Get("/orders/:id/activities")
  async listForOrder(@Param("id") id: string) {
    const items = await this.activitiesService.listForOrder(id);
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
  async listForContact(@Param("id") id: string) {
    const items = await this.activitiesService.listForContact(id);
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
}
