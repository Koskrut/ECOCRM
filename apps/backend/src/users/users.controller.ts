import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { Roles } from "../auth/roles.decorator";
import { RequirePermission } from "../rbac/permissions.decorator";
import { PermissionKeys } from "../rbac/rbac.constants";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(@Req() req: Request & { user?: AuthUser }) {
    return { items: await this.usersService.listUsers(req.user) };
  }

  @Get(":id")
  async getOne(@Param("id") id: string, @Req() req: Request & { user?: AuthUser }) {
    const user = await this.usersService.getUserById(id, req.user);
    return { user };
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.UsersManage)
  async create(@Body() body: Record<string, unknown>) {
    const user = await this.usersService.createUser({
      email: String(body.email ?? ""),
      username: body.username != null ? String(body.username) : undefined,
      fullName: body.fullName != null ? String(body.fullName) : "",
      firstName: body.firstName != null ? String(body.firstName) : undefined,
      lastName: body.lastName != null ? String(body.lastName) : undefined,
      password: body.password != null ? String(body.password) : undefined,
      role: body.role != null ? String(body.role) : undefined,
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
    });

    return { user };
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.UsersManage)
  async update(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    const numOrNull = (v: unknown): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const strOrNull = (v: unknown): string | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      return String(v);
    };
    const user = await this.usersService.updateUser(id, {
      email: body.email != null ? String(body.email) : undefined,
      username:
        body.username === undefined
          ? undefined
          : body.username === null || body.username === ""
            ? null
            : String(body.username),
      fullName: body.fullName != null ? String(body.fullName) : undefined,
      firstName: body.firstName != null ? String(body.firstName) : undefined,
      password:
        body.password === undefined || body.password === null
          ? undefined
          : String(body.password).trim() === ""
            ? undefined
            : String(body.password),
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
      routeStartLat: numOrNull(body.routeStartLat),
      routeStartLng: numOrNull(body.routeStartLng),
      routeEndLat: numOrNull(body.routeEndLat),
      routeEndLng: numOrNull(body.routeEndLng),
      routeStartLabel: strOrNull(body.routeStartLabel),
      routeEndLabel: strOrNull(body.routeEndLabel),
      leadId:
        body.leadId === undefined
          ? undefined
          : body.leadId === null || body.leadId === ""
            ? null
            : String(body.leadId),
      fuelLitersPer100km:
        body.fuelLitersPer100km === undefined || body.fuelLitersPer100km === ""
          ? undefined
          : (numOrNull(body.fuelLitersPer100km) ?? undefined),
      fuelPricePerLiter:
        body.fuelPricePerLiter === undefined
          ? undefined
          : body.fuelPricePerLiter === null || body.fuelPricePerLiter === ""
            ? null
            : (numOrNull(body.fuelPricePerLiter) as number | null),
      vehicleLabel: strOrNull(body.vehicleLabel),
      usePersonalCar:
        body.usePersonalCar === undefined ? undefined : Boolean(body.usePersonalCar),
    });

    return { user };
  }

  @Patch(":id/role")
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.UsersManage)
  async updateRole(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    const user = await this.usersService.updateRole(id, String(body.role ?? ""));
    return { user };
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  @RequirePermission(PermissionKeys.UsersManage)
  async remove(@Param("id") id: string) {
    return this.usersService.deleteUser(id);
  }
}
