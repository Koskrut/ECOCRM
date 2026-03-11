import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  UnauthorizedException,
} from "@nestjs/common";
import { Response } from "express";

/**
 * Sends the full exception response body for 401 so custom fields (e.g. __debug)
 * are not dropped by Nest's default serialization.
 */
@Catch(UnauthorizedException)
export class UnauthorizedExceptionFilter implements ExceptionFilter {
  catch(exception: UnauthorizedException, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const status = exception.getStatus();
    const body = exception.getResponse();
    const payload =
      typeof body === "object" && body !== null ? body : { message: body };
    res.status(status).json({ statusCode: status, ...payload });
  }
}
