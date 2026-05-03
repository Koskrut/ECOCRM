import { CallHandler, ExecutionContext, HttpException, Injectable, NestInterceptor } from "@nestjs/common";
import type { Request } from "express";
import { Observable, catchError, from, map, mergeMap, throwError } from "rxjs";
import { FinanceIdempotencyService } from "./finance-idempotency.service";

const HEADER = "idempotency-key";

function toJsonSafe(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}

function shouldApplyFinanceIdempotency(req: Request): boolean {
  if (req.method !== "POST") return false;
  const p = req.path ?? "";
  if (p.startsWith("/payments")) return true;
  if (p.startsWith("/bank/")) return true;
  if (p.startsWith("/payment-requests")) return true;
  return false;
}

function normalizeKey(raw: string | undefined): string | null {
  if (!raw) return null;
  const k = raw.trim();
  if (!k || k.length > 200) return null;
  return k;
}

@Injectable()
export class FinanceIdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly idem: FinanceIdempotencyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!shouldApplyFinanceIdempotency(req)) {
      return next.handle();
    }
    const key = normalizeKey(req.headers[HEADER] as string | undefined);
    if (!key) {
      return next.handle();
    }

    const path = req.path ?? req.url?.split("?")[0] ?? "";
    const method = req.method;
    const body = req.body;

    return from(this.idem.reserveOrReplay({ key, method, path, body })).pipe(
      mergeMap((r) => {
        const replay = r.replay;
        if (replay) {
          const payload = replay.body as string | Record<string, unknown>;
          return throwError(() => new HttpException(payload, replay.status));
        }
        return next.handle().pipe(
          mergeMap((data) =>
            from(this.idem.complete(key, 200, toJsonSafe(data))).pipe(map(() => data)),
          ),
          catchError((err: unknown) =>
            from(this.idem.abort(key)).pipe(
              mergeMap(() => throwError(() => err)),
            ),
          ),
        );
      }),
    );
  }
}
