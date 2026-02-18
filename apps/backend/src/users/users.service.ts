import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}

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
   passwordHashValue,
        fullName: payload.fullName ?? null,
        firstName: payload.firstName ?? null,
        lastName: payload.lastName ?? null,
        role: (payload.role as any) ?? undefined,
        isActive: payload.isActive ?? true,
      } as any,
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

    const data: any = {
      email: payload.email ?? undefined,
      fullName: payload.fullName ?? undefined,
      firstName: payload.firstName ?? undefined,
      lastName: payload.lastName ?? undefined,
      isActive: payload.isActive ?? undefined,
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
      data: { role: role as any } as any,
    });
  }

  async deleteUser(id: string) {
    if (!id) throw new BadRequestException("id is required");
    return this.prisma.user.delete({ where: { id } });
  }
}
