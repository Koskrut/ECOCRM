import { BadRequestException, Body, Controller, Get, Post, Req, Inject } from "@nestjs/common";
import type { Request } from "express";
import { AuthService } from "./auth.service";
import { Public } from "./public.decorator";
import type { AuthUser } from "./auth.types";
import type { LoginDto } from "./dto/login.dto";
import { validateLoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import { validateRegisterDto } from "./dto/register.dto";
import type { ValidationError } from "../common/validation";

const assertValid = (errors: ValidationError[]): void => {
  if (errors.length === 0) {
    return;
  }
  const detail = errors.map((error) => `${error.field}: ${error.message}`).join(", ");
  throw new BadRequestException(`Validation failed: ${detail}`);
};

@Controller("/auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Public()
  @Post("/register")
  public async register(@Body() body: RegisterDto) {
    const errors = validateRegisterDto(body);
    assertValid(errors);
    return this.authService.register(body);
  }

  @Public()
  @Post("/login")
  public async login(@Body() body: LoginDto) {
    const errors = validateLoginDto(body);
    assertValid(errors);
    return this.authService.login(body);
  }

  @Public()
  @Post("/password-reset/request")
  public async requestPasswordReset(@Body() body: { email?: string }) {
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    return this.authService.requestPasswordReset(email);
  }

  @Public()
  @Post("/password-reset/confirm")
  public async confirmPasswordReset(
    @Body() body: { email?: string; code?: string; newPassword?: string },
  ) {
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    return this.authService.confirmPasswordReset(email, code, newPassword);
  }

  @Public()
  @Get("/telegram-widget-config")
  public async getTelegramWidgetConfig() {
    return this.authService.getTelegramWidgetConfig();
  }

  @Public()
  @Post("/telegram-login")
  public async telegramLogin(
    @Body()
    body: {
      id?: number;
      first_name?: string;
      username?: string;
      auth_date?: number;
      hash?: string;
    },
  ) {
    if (
      typeof body?.id !== "number" ||
      typeof body?.auth_date !== "number" ||
      typeof body?.hash !== "string"
    ) {
      throw new BadRequestException("id, auth_date and hash required");
    }
    return this.authService.loginWithTelegram({
      id: body.id,
      first_name: body.first_name,
      username: body.username,
      auth_date: body.auth_date,
      hash: body.hash,
    });
  }

  @Post("/telegram-link-request")
  public async requestTelegramLink(@Req() req: Request & { user?: AuthUser }) {
    if (!req.user) throw new BadRequestException("Authentication required");
    return this.authService.requestTelegramLink(req.user.id);
  }

  @Get("/me")
  public async me(@Req() request: Request & { user?: AuthUser }) {
    if (!request.user) {
      throw new BadRequestException("User not found in request");
    }

    return {
      user: request.user,
    };
  }
}
