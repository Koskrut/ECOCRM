import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Observable } from "rxjs";
import type { AuthUser } from "../auth/auth.types";
import { runWithAuditContext } from "./audit-context";

@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }
    const req = context.switchToHttp().getRequest<{
      user?: AuthUser;
      method?: string;
      originalUrl?: string;
      url?: string;
      ip?: string;
      headers?: Record<string, string | string[] | undefined>;
    }>();
    const user = req?.user;
    const requestIdHeader = req?.headers?.["x-request-id"];
    const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
    return runWithAuditContext(
      {
        actor: {
          id: user?.id ?? "system",
          role: user?.role ?? null,
        },
        request: {
          method: req?.method,
          path: req?.originalUrl ?? req?.url,
          ip: req?.ip,
          userAgent: req?.headers?.["user-agent"] as string | undefined,
          requestId,
          source: "http",
        },
      },
      () => next.handle(),
    );
  }
}
