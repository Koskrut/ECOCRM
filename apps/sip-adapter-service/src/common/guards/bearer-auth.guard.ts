import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { CONFIG } from "../../config/config.module";
import type { AppConfig } from "../../config/configuration";

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    const expected = this.config.apiToken;
    if (!expected) {
      throw new UnauthorizedException("SIP_ADAPTER_API_TOKEN not configured");
    }
    if (!auth?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing Bearer token");
    }
    const token = auth.slice("Bearer ".length).trim();
    if (token !== expected) {
      throw new UnauthorizedException("Invalid Bearer token");
    }
    return true;
  }
}
