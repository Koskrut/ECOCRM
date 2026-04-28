import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { REQUIRED_PERMISSIONS_KEY } from "./permissions.decorator";
import type { PermissionKey } from "./rbac.constants";
import { RbacService } from "./rbac.service";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<PermissionKey[]>(REQUIRED_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException("User is not authenticated");

    const allowed = await this.rbac.hasAllPermissions(user, required);
    if (!allowed) throw new ForbiddenException("Insufficient permissions");
    return true;
  }
}
