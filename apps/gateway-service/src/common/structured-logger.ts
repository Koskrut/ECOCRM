import { Injectable, Logger } from "@nestjs/common";

export type LogFields = Record<string, string | number | boolean | undefined | null>;

@Injectable()
export class StructuredLogger {
  private readonly logger = new Logger("Gateway");

  private line(level: "log" | "warn" | "error" | "debug", msg: string, fields?: LogFields): void {
    const payload =
      fields && Object.keys(fields).length > 0
        ? `${msg} ${JSON.stringify(sanitizeFields(fields))}`
        : msg;
    this.logger[level](payload);
  }

  log(msg: string, fields?: LogFields): void {
    this.line("log", msg, fields);
  }

  warn(msg: string, fields?: LogFields): void {
    this.line("warn", msg, fields);
  }

  error(msg: string, fields?: LogFields): void {
    this.line("error", msg, fields);
  }

  debug(msg: string, fields?: LogFields): void {
    this.line("debug", msg, fields);
  }
}

function sanitizeFields(f: LogFields): LogFields {
  const out: LogFields = { ...f };
  if (typeof out.phone === "string") {
    const d = out.phone.replace(/\D/g, "");
    out.phone = d.length <= 4 ? "****" : `***${d.slice(-4)}`;
  }
  return out;
}
