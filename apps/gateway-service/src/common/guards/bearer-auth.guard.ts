import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import type { AppConfig } from "../../config/configuration";
import { CONFIG } from "../../config/config.module";
import { Inject } from "@nestjs/common";

@Injectable()
export class BearerAuthGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const auth = req.headers.authorization;
    const expected = this.config.gatewayApiToken;
    const debug = this.config.gatewayDebugToken;
    if (!auth || !auth.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing Bearer token");
    }
    const token = auth.slice("Bearer ".length).trim();
    if (token === expected || (debug && token === debug)) {
      return true;
    }
    throw new UnauthorizedException("Invalid Bearer token");
  }
}
