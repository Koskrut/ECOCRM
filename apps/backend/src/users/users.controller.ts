import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import { UsersService } from "./users.service";

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  async list() {
    return { items: await this.usersService.listUsers() };
  }

  @Post()
  async create(@Body() body: Record<string, unknown>) {
    const user = await this.usersService.createUser({
      email: String(body.email ?? ""),
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
    const user = await this.usersService.updateUser(id, {
      email: body.email != null ? String(body.email) : undefined,
      fullName: body.fullName != null ? String(body.fullName) : undefined,
      firstName: body.firstName != null ? String(body.firstName) : undefined,
      password: body.password != null ? String(body.password) : undefined,
      isActive: body.isActive != null ? Boolean(body.isActive) : undefined,
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
