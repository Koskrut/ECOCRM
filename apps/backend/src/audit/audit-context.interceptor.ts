import type { CallHandler, ExecutionContext, NestInterceptor } from "@nestjs/common";
import { Injectable } from "@nestjs/common";
import { Observable } from "rxjs";
import type { AuthUser } from "../auth/auth.types";
import { runWithAuditContext } from "./audit-context";

const WEBHOOK_PATH_ACTORS: { prefix: string; actorId: string }[] = [
  { prefix: "/integrations/ringostat", actorId: "integration:ringostat" },
  { prefix: "/integrations/kyivstar-fmc", actorId: "integration:kyivstar-fmc" },
  { prefix: "/integrations/telegram", actorId: "integration:telegram" },
  { prefix: "/integrations/bitrix", actorId: "integration:bitrix" },
  { prefix: "/integrations/outbound-voice", actorId: "integration:outbound-voice" },
  { prefix: "/integrations/google-sheet", actorId: "integration:google-sheet" },
  { prefix: "/leads/meta", actorId: "integration:meta-leads" },
];

function resolveWebhookActor(path?: string): string | null {
  if (!path) return null;
  for (const entry of WEBHOOK_PATH_ACTORS) {
    if (path.includes(entry.prefix)) return entry.actorId;
  }
  return null;
}

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
    const path = req?.originalUrl ?? req?.url;
    const requestIdHeader = req?.headers?.["x-request-id"];
    const requestId = Array.isArray(requestIdHeader) ? requestIdHeader[0] : requestIdHeader;
    const webhookActor = !user ? resolveWebhookActor(path) : null;

    return runWithAuditContext(
      {
        actor: {
          id: user?.id ?? webhookActor ?? "system",
          role: user?.role ?? null,
        },
        request: {
          method: req?.method,
          path,
          ip: req?.ip,
          userAgent: req?.headers?.["user-agent"] as string | undefined,
          requestId,
          source: webhookActor ? "webhook" : "http",
        },
      },
      () => next.handle(),
    );
  }
}
