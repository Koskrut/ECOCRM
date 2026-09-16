import { Logger } from "@nestjs/common";

const logger = new Logger("ProcessSafety");

let installed = false;

/**
 * Log unhandled promise rejections instead of letting Node 20 kill the process.
 * Does not swallow the error: still logs stack. Fatal only for uncaughtException.
 */
export function installProcessSafetyHandlers(): void {
  if (installed) return;
  installed = true;

  process.on("unhandledRejection", (reason: unknown) => {
    const msg = reason instanceof Error ? reason.stack ?? reason.message : String(reason);
    logger.error(`unhandledRejection: ${msg}`);
  });

  process.on("uncaughtException", (err: Error) => {
    logger.error(`uncaughtException: ${err.stack ?? err.message}`);
  });
}
