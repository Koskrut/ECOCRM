import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { verifyJwt } from "../../auth/jwt";
import { PrismaService } from "../../prisma/prisma.service";

type RequestWithCustomer = Request & {
  customer?: { customerId: string; contactId: string };
};

type StoreTokenPayload = {
  aud?: string;
  sub?: string;
  contactId?: string | null;
};

@Injectable()
export class StoreJwtGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithCustomer>();
    const authHeader = request.headers.authorization;

    if (!authHeader) throw new UnauthorizedException("Missing Authorization header");

    const [type, token] = authHeader.split(" ");
    if (type !== "Bearer" || !token) throw new UnauthorizedException("Invalid Authorization header");

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");

    let payload: StoreTokenPayload;
    try {
      payload = verifyJwt<StoreTokenPayload>(token, secret);
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    if (payload.aud === "store" && payload.sub && payload.contactId) {
      request.customer = { customerId: payload.sub, contactId: payload.contactId };
      return true;
    }

    // Mini App JWT. Cabinet cookie is often dropped inside Telegram; this token is not.
    if (payload.aud === "store_tg" && payload.contactId) {
      const customer = await this.prisma.customer.findUnique({
        where: { contactId: payload.contactId },
        select: { id: true },
      });
      request.customer = {
        customerId: customer?.id ?? payload.contactId,
        contactId: payload.contactId,
      };
      return true;
    }

    throw new UnauthorizedException("Invalid token");
  }
}
