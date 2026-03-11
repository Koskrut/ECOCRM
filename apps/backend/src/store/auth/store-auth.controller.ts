import { Body, Controller, Post, Req, Res } from "@nestjs/common";
import { Request, Response } from "express";
import { StoreAuthService } from "./store-auth.service";
import type { StoreRegisterDto } from "./dto/store-register.dto";

@Controller("store/auth")
export class StoreAuthController {
  constructor(private readonly storeAuth: StoreAuthService) {}

  @Post("register")
  async register(@Body() dto: StoreRegisterDto) {
    return this.storeAuth.register(dto);
  }

  @Post("login")
  async login(
    @Req() req: Request,
    @Res({ passthrough: false }) res: Response,
  ) {
    const body = req.body as { phone?: string; password?: string };
    const result = await this.storeAuth.login({
      phone: body.phone ?? "",
      password: body.password ?? "",
    });
    if ("ok" in result && result.ok === false) {
      res.status(401).json({ message: result.message, __debug: result.__debug });
      return;
    }
    return res.json(result);
  }

  @Post("password-reset/request")
  async requestPasswordReset(@Body() body: { phone?: string }) {
    return this.storeAuth.requestPasswordReset(body.phone ?? "");
  }

  @Post("password-reset/confirm")
  async confirmPasswordReset(
    @Body() body: { phone?: string; code?: string; newPassword?: string },
  ) {
    return this.storeAuth.confirmPasswordReset(
      body.phone ?? "",
      body.code ?? "",
      body.newPassword ?? "",
    );
  }
}
