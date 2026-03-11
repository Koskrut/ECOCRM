// apps/backend/src/contacts/contacts.controller.ts
import {
  Body,
  Controller,
  Delete,
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

function parseNullableNumber(value: unknown): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

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
        middleName: body.middleName != null ? String(body.middleName) : null,
        phone: String(body.phone ?? ""),
        email: (body.email as string) ?? null,
        position: (body.position as string) ?? null,
        address: body.address !== undefined ? (body.address != null ? String(body.address) : null) : undefined,
        lat: body.lat !== undefined ? parseNullableNumber(body.lat) : undefined,
        lng: body.lng !== undefined ? parseNullableNumber(body.lng) : undefined,
        googlePlaceId:
          body.googlePlaceId !== undefined
            ? body.googlePlaceId != null
              ? String(body.googlePlaceId)
              : null
            : undefined,
        ownerId: body.ownerId !== undefined ? (body.ownerId != null ? String(body.ownerId) : null) : undefined,
        isPrimary: Boolean(body.isPrimary ?? false),
        externalCode: body.externalCode !== undefined ? (body.externalCode != null ? String(body.externalCode) : null) : undefined,
        region: body.region !== undefined ? (body.region != null ? String(body.region) : null) : undefined,
        addressInfo: body.addressInfo !== undefined ? (body.addressInfo != null ? String(body.addressInfo) : null) : undefined,
        city: body.city !== undefined ? (body.city != null ? String(body.city) : null) : undefined,
        clientType: body.clientType !== undefined ? (body.clientType != null ? String(body.clientType) : null) : undefined,
      },
      req.user,
    );
  }

  // LIST
  @Get()
  async list(
    @Req() req: Request & { user?: AuthUser },
    @Query("companyId") companyId?: string,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("pageSize") pageSize?: string,
  ) {
    return this.contactsService.list(
      {
        companyId,
        q,
        page: page ? Number(page) : undefined,
        pageSize: pageSize ? Number(pageSize) : undefined,
      },
      req.user,
    );
  }

  @Get(":id/phones")
  async listPhones(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const contact = await this.contactsService.getById(id, req.user);
    const c = contact as {
      phone: string;
      phoneNormalized?: string | null;
      phones?: { id: string; phone: string; phoneNormalized: string; label: string | null }[];
    };
    return {
      primary: { phone: c.phone, phoneNormalized: c.phoneNormalized ?? null },
      additional: c.phones ?? [],
    };
  }

  @Post(":id/phones")
  async addPhone(
    @Param("id") id: string,
    @Body() body: { phone: string; label?: string },
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.contactsService.addPhone(
      id,
      { phone: String(body.phone ?? ""), label: body.label ?? null },
      req.user,
    );
  }

  @Delete(":id/phones/:phoneId")
  async deletePhone(
    @Param("id") id: string,
    @Param("phoneId") phoneId: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.contactsService.deletePhone(id, phoneId, req.user);
  }

  @Post(":id/phones/:phoneId/set-primary")
  async setPrimaryPhone(
    @Param("id") id: string,
    @Param("phoneId") phoneId: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.contactsService.setPrimaryPhone(id, phoneId, req.user);
  }

  @Get(":id/shipping-profiles")
  async listShippingProfiles(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.contactsService.listShippingProfiles(id, req.user);
  }

  @Post(":id/shipping-profiles/from-bitrix")
  async createShippingProfileFromBitrix(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.contactsService.createShippingProfileFromBitrix(id, req.user);
  }

  @Post(":id/shipping-profiles")
  async createShippingProfile(
    @Param("id") id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.contactsService.createShippingProfile(id, body, req.user);
  }

  @Patch(":id/shipping-profiles/:profileId")
  async updateShippingProfile(
    @Param("id") id: string,
    @Param("profileId") profileId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.contactsService.updateShippingProfile(id, profileId, body, req.user);
  }

  @Delete(":id/shipping-profiles/:profileId")
  async deleteShippingProfile(
    @Param("id") id: string,
    @Param("profileId") profileId: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.contactsService.deleteShippingProfile(id, profileId, req.user);
  }

  @Get(":id")
  async getOne(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    return this.contactsService.getById(id, req.user);
  }

  @Post(":id/reset-store-password")
  async resetStorePassword(
    @Param("id") id: string,
    @Req() req: Request & { user?: AuthUser },
  ) {
    return this.contactsService.resetStorePassword(id, req.user);
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
        companyId: body.companyId !== undefined ? (body.companyId != null ? String(body.companyId) : null) : undefined,
        firstName: body.firstName != null ? String(body.firstName) : undefined,
        lastName: body.lastName != null ? String(body.lastName) : undefined,
        middleName: body.middleName !== undefined ? (body.middleName != null ? String(body.middleName) : null) : undefined,
        phone: body.phone != null ? String(body.phone) : undefined,
        email: body.email != null ? String(body.email) : undefined,
        position: body.position != null ? String(body.position) : undefined,
        address: body.address !== undefined ? (body.address != null ? String(body.address) : null) : undefined,
        lat: body.lat !== undefined ? parseNullableNumber(body.lat) : undefined,
        lng: body.lng !== undefined ? parseNullableNumber(body.lng) : undefined,
        googlePlaceId:
          body.googlePlaceId !== undefined
            ? body.googlePlaceId != null
              ? String(body.googlePlaceId)
              : null
            : undefined,
        ownerId: body.ownerId !== undefined ? (body.ownerId != null ? String(body.ownerId) : null) : undefined,
        isPrimary: body.isPrimary != null ? Boolean(body.isPrimary) : undefined,
        externalCode: body.externalCode !== undefined ? (body.externalCode != null ? String(body.externalCode) : null) : undefined,
        region: body.region !== undefined ? (body.region != null ? String(body.region) : null) : undefined,
        addressInfo: body.addressInfo !== undefined ? (body.addressInfo != null ? String(body.addressInfo) : null) : undefined,
        city: body.city !== undefined ? (body.city != null ? String(body.city) : null) : undefined,
        clientType: body.clientType !== undefined ? (body.clientType != null ? String(body.clientType) : null) : undefined,
      },
      req.user,
    );
  }
}
