import { Injectable, NotFoundException } from "@nestjs/common";
import { randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";

const TOKEN_TTL_MINUTES = 15;
const TOKEN_BYTES = 12;

@Injectable()
export class StoreTelegramLinkService {
  constructor(private readonly prisma: PrismaService) {}

  async createLink(contactId: string): Promise<{ link: string; code: string; expiresAt: string }> {
    const token = randomBytes(TOKEN_BYTES).toString("base64url").replace(/=/g, "").slice(0, 16);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);
    await this.prisma.storeTelegramLinkToken.create({
      data: { token, contactId, expiresAt },
    });
    const botUsername = process.env.STORE_TELEGRAM_BOT_USERNAME || process.env.TELEGRAM_BOT_USERNAME || "StoreBot";
    const link = `https://t.me/${botUsername}?start=${token}`;
    return {
      link,
      code: token,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async consumeToken(token: string): Promise<string | null> {
    const now = new Date();
    const row = await this.prisma.storeTelegramLinkToken.findUnique({
      where: { token },
    });
    if (!row || row.expiresAt < now) return null;
    await this.prisma.storeTelegramLinkToken.delete({ where: { id: row.id } }).catch(() => {});
    return row.contactId;
  }
}
