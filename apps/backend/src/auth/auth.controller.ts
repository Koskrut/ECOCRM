import { BadRequestException, Body, Controller, Get, Post, Req } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { Public } from "./public.decorator";
import { AuthUser } from "./auth.types";
import { LoginDto, validateLoginDto } from "./dto/login.dto";
import { RegisterDto, validateRegisterDto } from "./dto/register.dto";
import { ValidationError } from "../common/validation";

const assertValid = (errors: ValidationError[]): void => {
  if (errors.length === 0) {
    return;
  }
  const detail = errors.map((error) => `${error.field}: ${error.message}`).join(", ");
  throw new BadRequestException(`Validation failed: ${detail}`);
};

@Controller("/auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
