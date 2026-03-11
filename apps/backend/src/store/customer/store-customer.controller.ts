import { BadRequestException, Body, Controller, Patch } from "@nestjs/common";
import { verifyJwt } from "../../auth/jwt";
import { hashPassword } from "../../auth/password";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("store/customer")
export class StoreCustomerController {
  constructor(private readonly prisma: PrismaService) {}

  @Patch("set-password")
  async setPassword(@Body() body: { token: string; password: string }) {
    const token = body.token?.trim();
    const password = body.password;
    if (!token || !password || password.length < 6) {
      throw new BadRequestException("Token and password (min 6 characters) required");
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new BadRequestException("Not configured");
    let payload: { purpose?: string; contactId?: string; sub?: string };
    try {
      payload = verifyJwt<{ purpose?: string; contactId?: string; sub?: string }>(token, secret);
    } catch {
      throw new BadRequestException("Invalid or expired link");
    }
    if (payload.purpose !== "set-password" || !payload.contactId) {
      throw new BadRequestException("Invalid token");
    }
    const customer = await this.prisma.customer.findUnique({
      where: { contactId: payload.contactId },
    });
    if (!customer) throw new BadRequestException("Customer not found");
    await this.prisma.customer.update({
      where: { id: customer.id },
      data: { passwordHash: hashPassword(password) },
    });
    return { ok: true };
  }
}
