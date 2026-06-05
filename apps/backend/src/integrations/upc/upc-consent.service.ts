import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { UpcHttpClient } from "./upc-http.client";

const UPC_INTEGRATION_PROVIDER = "upc";

export type UpcSettings = {
  isEnabled?: boolean;
  clientId?: string;
  redirectUri?: string;
  apiBaseUrl?: string;
};

@Injectable()
export class UpcConsentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly http: UpcHttpClient,
  ) {}

  async getSettings(): Promise<UpcSettings & { clientIdMasked?: string }> {
    const row = await this.prisma.integrationSetting.findFirst({
      where: { provider: UPC_INTEGRATION_PROVIDER, companyId: null },
    });
    const config = (row?.config ?? {}) as UpcSettings;
    const clientId = config.clientId ?? process.env.UPC_CLIENT_ID ?? "";
    return {
      isEnabled: row?.isEnabled ?? false,
      clientId: clientId || undefined,
      clientIdMasked: clientId ? `••••${clientId.slice(-4)}` : undefined,
      redirectUri: config.redirectUri ?? process.env.UPC_REDIRECT_URI ?? undefined,
      apiBaseUrl: config.apiBaseUrl ?? process.env.UPC_API_BASE_URL ?? undefined,
    };
  }

  async updateSettings(dto: UpcSettings): Promise<UpcSettings> {
    const existing = await this.prisma.integrationSetting.findFirst({
      where: { provider: UPC_INTEGRATION_PROVIDER, companyId: null },
    });
    const prev = (existing?.config ?? {}) as UpcSettings;
    const config: UpcSettings = {
      ...prev,
      ...(dto.isEnabled !== undefined && { isEnabled: dto.isEnabled }),
      ...(dto.clientId !== undefined && dto.clientId !== "" && { clientId: dto.clientId }),
      ...(dto.redirectUri !== undefined && { redirectUri: dto.redirectUri }),
      ...(dto.apiBaseUrl !== undefined && { apiBaseUrl: dto.apiBaseUrl }),
    };
    if (existing) {
      await this.prisma.integrationSetting.update({
        where: { id: existing.id },
        data: {
          isEnabled: dto.isEnabled ?? existing.isEnabled,
          config: config as object,
        },
      });
    } else {
      await this.prisma.integrationSetting.create({
        data: {
          provider: UPC_INTEGRATION_PROVIDER,
          isEnabled: dto.isEnabled ?? true,
          config: config as object,
        },
      });
    }
    return this.getSettings();
  }

  async startConsent(bankAccountId: string): Promise<{ authorizationUrl: string }> {
    const account = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!account) throw new NotFoundException("Bank account not found");
    if (account.provider !== "UPC") {
      throw new BadRequestException("Consent is only for UPC bank accounts");
    }

    const settings = await this.getSettings();
    const clientId = settings.clientId ?? process.env.UPC_CLIENT_ID;
    const redirectUri = settings.redirectUri ?? process.env.UPC_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      throw new BadRequestException("UPC clientId and redirectUri must be configured");
    }

    if (this.http.isMockMode()) {
      const mockConsentId = `mock-consent-${bankAccountId}`;
      await this.prisma.upcConsent.upsert({
        where: { bankAccountId },
        create: {
          bankAccountId,
          consentId: mockConsentId,
          status: "ACTIVE",
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
        update: { consentId: mockConsentId, status: "ACTIVE" },
      });
      await this.prisma.bankAccount.update({
        where: { id: bankAccountId },
        data: {
          credentials: {
            ...(account.credentials as object),
            consentId: mockConsentId,
            resourceId: `mock-resource-${bankAccountId}`,
            accessToken: "mock-access-token",
          },
        },
      });
      return { authorizationUrl: `${redirectUri}?mock=1&bankAccountId=${bankAccountId}` };
    }

    const state = Buffer.from(JSON.stringify({ bankAccountId })).toString("base64url");
    const base = (settings.apiBaseUrl ?? process.env.UPC_API_BASE_URL ?? "").replace(/\/+$/, "");
    const url = new URL(`${base}/oauth/authorize`);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "AIS");
    url.searchParams.set("state", state);
    return { authorizationUrl: url.toString() };
  }

  async handleCallback(code: string, state: string): Promise<{ bankAccountId: string; status: string }> {
    let bankAccountId: string;
    try {
      const parsed = JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as {
        bankAccountId?: string;
      };
      if (!parsed.bankAccountId) throw new Error("missing bankAccountId");
      bankAccountId = parsed.bankAccountId;
    } catch {
      throw new BadRequestException("Invalid consent state");
    }

    const account = await this.prisma.bankAccount.findUnique({ where: { id: bankAccountId } });
    if (!account) throw new NotFoundException("Bank account not found");

    if (this.http.isMockMode()) {
      return { bankAccountId, status: "ACTIVE" };
    }

    const settings = await this.getSettings();
    const tokenRes = await this.http.request<{
      access_token?: string;
      consent_id?: string;
      expires_in?: number;
    }>({
      method: "POST",
      path: "/oauth/token",
      body: {
        grant_type: "authorization_code",
        code,
        redirect_uri: settings.redirectUri ?? process.env.UPC_REDIRECT_URI,
        client_id: settings.clientId ?? process.env.UPC_CLIENT_ID,
      },
    });

    const consentId = tokenRes.consent_id ?? `consent-${Date.now()}`;
    const expiresAt = tokenRes.expires_in
      ? new Date(Date.now() + tokenRes.expires_in * 1000)
      : null;

    await this.prisma.upcConsent.upsert({
      where: { bankAccountId },
      create: { bankAccountId, consentId, status: "ACTIVE", expiresAt },
      update: { consentId, status: "ACTIVE", expiresAt, lastRefreshAt: new Date() },
    });

    const creds = (account.credentials as Record<string, unknown>) ?? {};
    await this.prisma.bankAccount.update({
      where: { id: bankAccountId },
      data: {
        credentials: {
          ...creds,
          consentId,
          accessToken: tokenRes.access_token,
          resourceId: creds.resourceId ?? account.iban,
        },
      },
    });

    return { bankAccountId, status: "ACTIVE" };
  }

  async getConsentStatus(bankAccountId: string) {
    const consent = await this.prisma.upcConsent.findUnique({ where: { bankAccountId } });
    return consent ?? { status: "NONE" };
  }
}
