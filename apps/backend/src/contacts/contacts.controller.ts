// apps/backend/src/contacts/contacts.controller.ts
import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ContactsService } from "./contacts.service";

@Controller("contacts")
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  // CREATE
  @Post()
  async create(@Body() body: any) {
    return this.contactsService.create({
      companyId: body.companyId ?? null,
      firstName: body.firstName,
      lastName: body.lastName,
      phone: body.phone,
      email: body.email ?? null,
      position: body.position ?? null,
      isPrimary: body.isPrimary ?? false,
    });
  }

  // LIST
  // поддержка: ?companyId=...&page=1&pageSize=20
  @Get()
  async list(
    @Query("companyId") companyId?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.contactsService.list({
      companyId,
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
    });
  }

  // ✅ NP shipping profiles (for TTN modal)
  // GET /contacts/:id/shipping-profiles
  @Get(":id/shipping-profiles")
  async listShippingProfiles(@Param("id") id: string) {
    return this.contactsService.listShippingProfiles(id);
  }

  // (optional) POST /contacts/:id/shipping-profiles
  @Post(":id/shipping-profiles")
  async createShippingProfile(@Param("id") id: string, @Body() body: any) {
    return this.contactsService.createShippingProfile(id, body);
  }

  // GET ONE
  @Get(":id")
  async getOne(@Param("id") id: string) {
    return this.contactsService.getById(id);
  }

  // UPDATE
  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: any) {
    return this.contactsService.update(id, {
      companyId: body.companyId ?? undefined,
      firstName: body.firstName ?? undefined,
      lastName: body.lastName ?? undefined,
      phone: body.phone ?? undefined,
      email: body.email ?? undefined,
      position: body.position ?? undefined,
      isPrimary: body.isPrimary ?? undefined,
    });
  }
}
