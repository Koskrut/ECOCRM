import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AuthUser, JwtPayload } from "./auth.types";
import { verifyJwt } from "./jwt";
import { IS_PUBLIC_KEY } from "./public.decorator";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (request.path?.startsWith("/store")) return true;

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;
    const authHeader = request.headers.authorization;

    if (!authHeader) throw new UnauthorizedException("Missing Authorization header");

    const [type, token] = authHeader.split(" ");
    if (type !== "Bearer" || !token)
      throw new UnauthorizedException("Invalid Authorization header");

    try {
      const payload = verifyJwt<JwtPayload>(token, this.getJwtSecret());
      request.user = {
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        fullName: payload.fullName,
      };
      return true;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
  }

  private getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error("JWT_SECRET is not set");
    return secret;
  }
}
