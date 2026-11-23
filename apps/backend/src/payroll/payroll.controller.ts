import {
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Param,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import type { AuthUser } from "../auth/auth.types";
import { PayrollService } from "./payroll.service";

@Controller("payroll")
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Get("me")
  async getMe(
    @Query("month") month: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) throw new InternalServerErrorException("Missing user");
    try {
      return await this.payroll.getMe(req.user, month);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException(e instanceof Error ? e.message : String(e));
    }
  }

  @Get("team")
  async getTeam(
    @Query("month") month: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) throw new InternalServerErrorException("Missing user");
    try {
      return await this.payroll.getTeam(req.user, month);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException(e instanceof Error ? e.message : String(e));
    }
  }

  @Get("users/:id")
  async getUser(
    @Param("id") id: string,
    @Query("month") month: string | undefined,
    @Req() req: Request & { user?: AuthUser },
  ) {
    if (!req.user) throw new InternalServerErrorException("Missing user");
    try {
      return await this.payroll.getForUser(req.user, id, month);
    } catch (e) {
      if (e instanceof HttpException) throw e;
      throw new InternalServerErrorException(e instanceof Error ? e.message : String(e));
    }
  }
}
