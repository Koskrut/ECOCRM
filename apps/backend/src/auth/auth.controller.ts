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
