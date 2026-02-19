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
  async create(@Body() body: any) {
    const user = await this.usersService.createUser({
      email: body.email,
      fullName: body.fullName ?? "",
      firstName: body.firstName,
      lastName: body.lastName,
      password: body.password, // ✅ теперь сервис принимает password
      role: body.role,
      isActive: body.isActive,
    });

    return { user };
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() body: any) {
    const user = await this.usersService.updateUser(id, {
      email: body.email,
      fullName: body.fullName,
      firstName: body.firstName,
      password: body.password,
      isActive: body.isActive,
    });

    return { user };
  }

  @Patch(":id/role")
  async updateRole(@Param("id") id: string, @Body() body: any) {
    const user = await this.usersService.updateRole(id, body.role);
    return { user };
  }

  @Delete(":id")
  async remove(@Param("id") id: string) {
    return this.usersService.deleteUser(id);
  }
}
