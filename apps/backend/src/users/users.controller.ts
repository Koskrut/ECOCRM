import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list(@Req() req: Request & { user?: AuthUser }) {
    return { items: await this.usersService.listUsers(req.user) };
  }

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    const user = await this.usersService.createUser({
      email: String(body.email ?? ""),
      username: body.username != null ? String(body.username) : undefined,
      fullName: body.fullName != null ? String(body.fullName) : "",
      firstName: body.firstName != null ? String(body.firstName) : undefined,
      lastName: body.lastName != null ? String(body.lastName) : undefined,
      password: body.password != null ? String(body.password) : undefined,
      role: body.role != null ? String(body.role) : undefined,
      isActive: body.isActive != null ? Boolean(body.isActive) : undefined,
    });

    return { user };
  }

  @Patch(":id")
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
      password: body.password != null ? String(body.password) : undefined,
      isActive: body.isActive != null ? Boolean(body.isActive) : undefined,
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
    });

    return { user };
  }

  @Patch(":id/role")
  async updateRole(@Param("id") id: string, @Body() body: Record<string, unknown>) {
    const user = await this.usersService.updateRole(id, String(body.role ?? ""));
    return { user };
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    return this.usersService.deleteUser(id);
  }
}
