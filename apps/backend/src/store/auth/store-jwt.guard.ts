import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { Request } from "express";
import { verifyJwt } from "../../auth/jwt";
import type { StoreJwtPayload } from "./store-auth.types";

@Injectable()
export class StoreJwtGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { customer?: { customerId: string; contactId: string } }>();
    const authHeader = request.headers.authorization;

    if (!authHeader) throw new UnauthorizedException("Missing Authorization header");

    const [type, token] = authHeader.split(" ");
    if (type !== "Bearer" || !token) throw new UnauthorizedException("Invalid Authorization header");

    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");

    try {
      const payload = verifyJwt<StoreJwtPayload>(token, secret);
      if (payload.aud !== "store" || !payload.sub || !payload.contactId) {
        throw new UnauthorizedException("Invalid token");
      }
      request.customer = { customerId: payload.sub, contactId: payload.contactId };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
