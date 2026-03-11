import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { SettingsService } from "../settings/settings.service";
import { TelegramService } from "../integrations/telegram/telegram.service";
import type { User } from "@prisma/client";
import { UserRole } from "@prisma/client";
import type { LoginDto } from "./dto/login.dto";
import type { RegisterDto } from "./dto/register.dto";
import { signJwt } from "./jwt";
import { hashPassword, verifyPassword, needsRehash } from "./password";
import { isTelegramAuthDateValid, verifyTelegramLoginHash } from "./telegram-widget";

export type AuthResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
  };
};

const RESET_CODE_LENGTH = 6;
const RESET_CODE_TTL_MINUTES = 15;
const TELEGRAM_LINK_TOKEN_TTL_MINUTES = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly telegram: TelegramService,
  ) {}

  public async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) {
      throw new ConflictException("User with this email already exists");
    }

    const usersCount = await this.prisma.user.count();
    const role = usersCount === 0 ? (dto.role ?? UserRole.ADMIN) : UserRole.MANAGER;

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

    if (needsRehash(user.passwordHash)) {
      const newHash = hashPassword(dto.password);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: newHash },
      });
    }

    return this.buildAuthResponse(user);
  }

  /** Request password reset: send 6-digit code to Telegram if user has it linked, else suggest connecting. */
  async requestPasswordReset(email: string): Promise<{
    sentVia: "telegram" | null;
    suggestConnectTelegram: boolean;
    message: string;
  }> {
    const normalized = String(email ?? "").trim().toLowerCase();
    if (!normalized) throw new BadRequestException("Email required");

    const user = await this.prisma.user.findUnique({
      where: { email: normalized },
      select: { id: true, telegramChatId: true },
    });
    if (!user) {
      return {
        sentVia: null,
        suggestConnectTelegram: false,
        message: "Если аккаунт с таким email существует, код отправлен в Telegram.",
      };
    }

    const code = randomBytes(3).readUIntBE(0, 3) % 1_000_000;
    const codeStr = code.toString().padStart(RESET_CODE_LENGTH, "0");
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000);

    await this.prisma.passwordResetCode.deleteMany({ where: { email: normalized } });
    await this.prisma.passwordResetCode.create({
      data: { email: normalized, code: codeStr, expiresAt },
    });

    if (user.telegramChatId) {
      try {
        await this.telegram.sendMessageToChat(
          user.telegramChatId,
          `Код для сброса пароля CRM: ${codeStr}\nДействует ${RESET_CODE_TTL_MINUTES} мин.`,
        );
        return {
          sentVia: "telegram",
          suggestConnectTelegram: false,
          message: "Код отправлен в Telegram.",
        };
      } catch {
        return {
          sentVia: null,
          suggestConnectTelegram: true,
          message: "Не удалось отправить код в Telegram. Подключите Telegram в настройках CRM.",
        };
      }
    }

    return {
      sentVia: null,
      suggestConnectTelegram: true,
      message:
        "К этому аккаунту не привязан Telegram. Подключите Telegram в настройках CRM (войдите с помощью коллеги или администратора), чтобы получать коды сброса пароля.",
    };
  }

  /** Confirm password reset with code and set new password. Returns auth token. */
  async confirmPasswordReset(
    email: string,
    code: string,
    newPassword: string,
  ): Promise<AuthResponse> {
    const normalized = String(email ?? "").trim().toLowerCase();
    if (!normalized || !code?.trim() || !newPassword || newPassword.length < 6) {
      throw new BadRequestException("Email, code and new password (min 6 chars) required");
    }

    const row = await this.prisma.passwordResetCode.findFirst({
      where: { email: normalized, code: code.trim() },
      orderBy: { createdAt: "desc" },
    });
    if (!row) throw new UnauthorizedException("Неверный или устаревший код");
    if (row.expiresAt < new Date()) {
      await this.prisma.passwordResetCode.deleteMany({ where: { email: normalized } });
      throw new UnauthorizedException("Код истёк. Запросите новый.");
    }

    const user = await this.prisma.user.findUnique({ where: { email: normalized } });
    if (!user) throw new NotFoundException("User not found");

    await this.prisma.passwordResetCode.deleteMany({ where: { email: normalized } });
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword) },
    });

    return this.buildAuthResponse(user);
  }

  /** Login with Telegram Login Widget data. User must have telegramUserId linked. */
  async loginWithTelegram(data: {
    id: number;
    first_name?: string;
    username?: string;
    auth_date: number;
    hash: string;
  }): Promise<AuthResponse> {
    const botToken = (await this.settings.getTelegramSecrets()).botToken;
    if (!botToken) throw new BadRequestException("Telegram login not configured");

    if (!isTelegramAuthDateValid(data.auth_date)) {
      throw new UnauthorizedException("Срок действия данных истёк. Войдите снова через Telegram.");
    }

    const ok = verifyTelegramLoginHash(
      {
        id: data.id,
        first_name: data.first_name,
        username: data.username,
        auth_date: data.auth_date,
        hash: data.hash,
      },
      botToken,
    );
    if (!ok) throw new UnauthorizedException("Invalid Telegram data");

    const user = await this.prisma.user.findUnique({
      where: { telegramUserId: String(data.id) },
    });
    if (!user) {
      throw new UnauthorizedException(
        "Этот аккаунт Telegram не привязан к пользователю CRM. Подключите Telegram в настройках (войдите по email и паролю).",
      );
    }

    return this.buildAuthResponse(user);
  }

  /** Public config for Telegram Login Widget (bot username). */
  async getTelegramWidgetConfig(): Promise<{ botUsername: string | null }> {
    const { botToken } = await this.settings.getTelegramSecrets();
    if (!botToken) return { botUsername: null };
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`).catch(() => null);
    if (!res?.ok) return { botUsername: null };
    const data = (await res.json()) as { result?: { username?: string } };
    const username = data.result?.username ?? null;
    return { botUsername: username };
  }

  /** Create a one-time token for linking Telegram to current user (call when logged in). */
  async requestTelegramLink(userId: string): Promise<{ token: string; botUsername: string }> {
    const botToken = (await this.settings.getTelegramSecrets()).botToken;
    if (!botToken) throw new BadRequestException("Telegram not configured");

    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + TELEGRAM_LINK_TOKEN_TTL_MINUTES * 60 * 1000);
    await this.prisma.userTelegramLinkToken.deleteMany({ where: { userId } });
    await this.prisma.userTelegramLinkToken.create({
      data: { token, userId, expiresAt },
    });

    const botInfoRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`).catch(() => null);
    const botUsernameRes =
      botInfoRes && botInfoRes.ok
        ? ((await botInfoRes.json()) as { result?: { username?: string } }).result?.username
        : null;

    return {
      token,
      botUsername: botUsernameRes ? `@${botUsernameRes}` : "бот",
    };
  }

  /** Confirm Telegram link (called from bot when user sends /link TOKEN). */
  async confirmTelegramLink(
    token: string,
    telegramUserId: string,
    telegramChatId: string,
  ): Promise<{ email: string }> {
    const row = await this.prisma.userTelegramLinkToken.findUnique({
      where: { token: token.trim() },
    });
    if (!row || row.expiresAt < new Date()) {
      throw new UnauthorizedException("Неверная или просроченная ссылка. Запросите новую в настройках CRM.");
    }

    const user = await this.prisma.user.update({
      where: { id: row.userId },
      data: { telegramUserId, telegramChatId },
    });
    await this.prisma.userTelegramLinkToken.deleteMany({ where: { userId: row.userId } });

    return { email: user.email };
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
    if (!secret) throw new Error("JWT_SECRET is not set");
    return secret;
  }
}
