import { createHash } from "node:crypto";
import { ConflictException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { stableStringify } from "./stable-json";

const log = new Logger("FinanceIdempotencyService");

export type FinanceIdempotencyReplay = { status: number; body: unknown };

@Injectable()
export class FinanceIdempotencyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Hex sha256 of stable JSON (Node crypto). */
  bodyHashHex(body: unknown): string {
    return createHash("sha256").update(stableStringify(body ?? {}), "utf8").digest("hex");
  }

  /**
   * Reserve key or return a completed replay payload.
   * Caller must invoke `complete` after handler success, or `abort` on failure.
   */
  async reserveOrReplay(params: {
    key: string;
    method: string;
    path: string;
    body: unknown;
  }): Promise<{ replay?: FinanceIdempotencyReplay }> {
    const { key, method, path } = params;
    const bodySha256 = this.bodyHashHex(params.body);

    try {
      await this.prisma.financeIdempotencyRecord.create({
        data: {
          idempotencyKey: key,
          httpMethod: method,
          path,
          bodySha256,
          responseStatus: 0,
        },
      });
      return {};
    } catch (e: unknown) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") {
        throw e;
      }
    }

    const row = await this.prisma.financeIdempotencyRecord.findUnique({
      where: { idempotencyKey: key },
    });
    if (!row) {
      log.warn(`P2002 but row missing for key=${key.slice(0, 8)}…`);
      return {};
    }
    if (row.bodySha256 !== bodySha256) {
      throw new ConflictException("Idempotency-Key was already used with a different request body");
    }
    if (row.responseStatus === 0) {
      throw new ConflictException(
        "A request with this Idempotency-Key is still in progress; retry after it completes",
      );
    }
    return { replay: { status: row.responseStatus, body: row.responseBody ?? null } };
  }

  async complete(key: string, status: number, body: unknown): Promise<void> {
    await this.prisma.financeIdempotencyRecord.update({
      where: { idempotencyKey: key },
      data: {
        responseStatus: status,
        responseBody: body as Prisma.InputJsonValue,
      },
    });
  }

  async abort(key: string): Promise<void> {
    try {
      await this.prisma.financeIdempotencyRecord.delete({ where: { idempotencyKey: key } });
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") return;
      throw e;
    }
  }
}
