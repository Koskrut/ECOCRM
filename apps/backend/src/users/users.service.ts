import { BadRequestException, Injectable } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    return this.prisma.user.findMany({ orderBy: { createdAt: "desc" } });
  }

  async createUser(payload: {
    email: string;
    password?: string;
    passwordHash?: string;
    fullName?: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    isActive?: boolean;
  }) {
    if (!payload?.email) throw new BadRequestException("email is required");

    // Временно без bcrypt: чтобы просто поднять проект.
    // Позже заменим на bcrypt/argon2.
    const passwordHashValue =
      payload.passwordHash ?? (payload.password ? `plain:${payload.password}` : "");

    return this.prisma.user.create({
      data: {
        email: payload.email,
        passwordHash: passwordHashValue,
        fullName: payload.fullName ?? "",
        role: (payload.role as UserRole) ?? undefined,
      },
    });
  }

  async updateUser(
    id: string,
    payload: {
      email?: string;
      password?: string;
      fullName?: string;
      firstName?: string;
      lastName?: string;
      isActive?: boolean;
    },
  ) {
    if (!id) throw new BadRequestException("id is required");

    const data: Prisma.UserUpdateInput = {
      email: payload.email ?? undefined,
      fullName: payload.fullName ?? undefined,
    };

    if (payload.password !== undefined) {
      data.passwordHash = payload.password ? `plain:${payload.password}` : "";
    }

    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async updateRole(id: string, role: string) {
    if (!id) throw new BadRequestException("id is required");
    if (!role) throw new BadRequestException("role is required");

    return this.prisma.user.update({
      where: { id },
      data: { role: role as UserRole },
    });
  }

  async deleteUser(id: string) {
    if (!id) throw new BadRequestException("id is required");
    return this.prisma.user.delete({ where: { id } });
  }
}
