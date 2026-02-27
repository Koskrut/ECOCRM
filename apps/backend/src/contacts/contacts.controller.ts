// apps/backend/src/contacts/contacts.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { ContactsService } from "./contacts.service";

@Controller("contacts")
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  // CREATE
  @Post()
  async create(@Body() body: Record<string, unknown>, @Req() req: Request & { user?: AuthUser }) {
    return this.contactsService.create(
      {
        companyId: (body.companyId as string) ?? null,
        firstName: String(body.firstName ?? ""),
        lastName: String(body.lastName ?? ""),
        phone: String(body.phone ?? ""),
        email: (body.email as string) ?? null,
        position: (body.position as string) ?? null,
        isPrimary: Boolean(body.isPrimary ?? false),
      },
      req.user,
    );
  }

  // LIST
  @Get()
  async list(
    @Req() req: Request & { user?: AuthUser },
    @Query("companyId") companyId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.contactsService.list(
      {
        companyId,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      req.user,
    );
  }

  @Get(":id/shipping-profiles")
  async listShippingProfiles(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.contactsService.listShippingProfiles(id, req.user);
  }

  @Post(":id/shipping-profiles")
  async createShippingProfile(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.contactsService.createShippingProfile(id, body, req.user);
  }

  @Get(":id")
  async getOne(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.contactsService.getById(id, req.user);
  }

  @Patch(":id")
  async update(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.contactsService.update(
      id,
      {
        companyId: body.companyId != null ? String(body.companyId) : undefined,
        firstName: body.firstName != null ? String(body.firstName) : undefined,
        lastName: body.lastName != null ? String(body.lastName) : undefined,
        phone: body.phone != null ? String(body.phone) : undefined,
        email: body.email != null ? String(body.email) : undefined,
        position: body.position != null ? String(body.position) : undefined,
        isPrimary: body.isPrimary != null ? Boolean(body.isPrimary) : undefined,
      },
      req.user,
    );
  }
}
