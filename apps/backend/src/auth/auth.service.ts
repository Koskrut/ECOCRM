import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaClient, User, UserRole } from "@prisma/client";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { signJwt } from "./jwt";
import { hashPassword, verifyPassword } from "./password";

export type AuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
  };
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaClient) {}

  public async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException("User with this email already exists");
    }

    const usersCount = await this.prisma.user.count();
    const role = usersCount === 0 ? dto.role ?? UserRole.ADMIN : UserRole.MANAGER;

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        passwordHash: hashPassword(dto.password),
        role,
      },
    });

    return this.buildAuthResponse(user);
  }

  public async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException("Invalid email or password");
    }

    return this.buildAuthResponse(user);
  }

  private buildAuthResponse(user: User): AuthResponse {
    const token = signJwt(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
      },
      this.getJwtSecret(),
      { expiresInSeconds: 60 * 60 * 12 },
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  private getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new Error("JWT_SECRET is not set");
    }
    return secret;
  }
}
