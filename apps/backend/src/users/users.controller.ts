import { BadRequestException, Body, Controller, Get, Param, Patch } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { Roles } from "../auth/roles.decorator";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // Только админ видит список пользователей
  @Roles(UserRole.ADMIN)
  @Get()
  async list() {
    const items = await this.usersService.listUsers();
    return { items };
  }

  // Только админ может менять роль
  @Roles(UserRole.ADMIN)
  @Patch(":id/role")
  async updateRole(
    @Param("id") id: string,
    @Body() body: { role?: UserRole },
  ) {
    if (!body?.role) {
      throw new BadRequestException("role is required");
    }
    const user = await this.usersService.updateRole(id, body.role);
    return { user };
  }
}
