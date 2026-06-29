import { Injectable } from "@nestjs/common";
import { ClientPlatform } from "@prisma/client";
import type { AuthUser } from "../auth/auth.types";
import { kyivDayBounds, todayYmdKyiv } from "../crm-timezone";
import { PrismaService } from "../prisma/prisma.service";
import { extractClientIp, resolveIpGeo } from "./ip-geo.util";
import { PRESENCE_ONLINE_THRESHOLD_MS } from "./presence.constants";

const SESSION_GAP_MS = 5 * 60 * 1000;
const ONLINE_THRESHOLD_MS = PRESENCE_ONLINE_THRESHOLD_MS;
const MAX_HEARTBEAT_DELTA_SEC = 120;

type RequestMeta = {
  ip?: string | null;
  userAgent?: string | null;
};

type HeartbeatTelemetry = {
  appState?: string;
  trackingMode?: string;
};

@Injectable()
export class PresenceService {
  constructor(private readonly prisma: PrismaService) {}

  async heartbeat(
    user: AuthUser,
    platform: ClientPlatform,
    coords: { lat?: number; lng?: number },
    meta: RequestMeta,
    telemetry?: HeartbeatTelemetry,
  ) {
    const now = new Date();
    const ip = extractClientIp({ ip: meta.ip ?? undefined, headers: {} });
    const userAgent = meta.userAgent ?? null;
    const appState = telemetry?.appState ?? null;
    const trackingMode = telemetry?.trackingMode ?? null;
    const countsAsActive = !appState || appState === "ACTIVE";

    const recent = await this.prisma.userActivitySession.findFirst({
      where: {
        userId: user.id,
        platform,
        lastSeenAt: { gte: new Date(now.getTime() - SESSION_GAP_MS) },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    if (recent) {
      const deltaSec = countsAsActive
        ? Math.max(
            0,
            Math.min(
              Math.floor((now.getTime() - recent.lastSeenAt.getTime()) / 1000),
              MAX_HEARTBEAT_DELTA_SEC,
            ),
          )
        : 0;
      const lat = this.validCoord(coords.lat) ?? recent.lat;
      const lng = this.validCoord(coords.lng) ?? recent.lng;

      const updated = await this.prisma.userActivitySession.update({
        where: { id: recent.id },
        data: {
          lastSeenAt: now,
          activeSeconds: recent.activeSeconds + deltaSec,
          ...(lat != null ? { lat } : {}),
          ...(lng != null ? { lng } : {}),
          ...(ip ? { ip } : {}),
          ...(userAgent ? { userAgent } : {}),
          ...(appState ? { appState } : {}),
          ...(trackingMode ? { trackingMode } : {}),
        },
      });
      return { sessionId: updated.id, activeSeconds: updated.activeSeconds };
    }

    const geo = resolveIpGeo(ip);
    const created = await this.prisma.userActivitySession.create({
      data: {
        userId: user.id,
        platform,
        ip,
        userAgent,
        ipCity: geo.city,
        ipRegion: geo.region,
        ipCountry: geo.country,
        lat: this.validCoord(coords.lat),
        lng: this.validCoord(coords.lng),
        startedAt: now,
        lastSeenAt: now,
        activeSeconds: 0,
        appState,
        trackingMode,
      },
    });
    return { sessionId: created.id, activeSeconds: created.activeSeconds };
  }

  async end(user: AuthUser, platform?: ClientPlatform) {
    const now = new Date();
    const where = {
      userId: user.id,
      lastSeenAt: { gte: new Date(now.getTime() - SESSION_GAP_MS) },
      ...(platform ? { platform } : {}),
    };

    const sessions = await this.prisma.userActivitySession.findMany({
      where,
      orderBy: { lastSeenAt: "desc" },
    });

    if (sessions.length === 0) {
      return { ended: 0 };
    }

    await this.prisma.userActivitySession.updateMany({
      where: { id: { in: sessions.map((s) => s.id) } },
      data: { lastSeenAt: now },
    });

    return { ended: sessions.length };
  }

  async getOverview(dateYmd?: string) {
    const date = dateYmd ?? todayYmdKyiv();
    const { from, to } = kyivDayBounds(date);
    const now = new Date();

    const users = await this.prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
      },
      orderBy: { fullName: "asc" },
    });

    const sessions = await this.prisma.userActivitySession.findMany({
      where: {
        startedAt: { lte: to },
        lastSeenAt: { gte: from },
      },
      orderBy: { lastSeenAt: "desc" },
    });

    const byUser = new Map<string, typeof sessions>();
    for (const session of sessions) {
      const list = byUser.get(session.userId) ?? [];
      list.push(session);
      byUser.set(session.userId, list);
    }

    const items = users.map((user) => {
      const userSessions = byUser.get(user.id) ?? [];
      const activeSecondsToday = userSessions.reduce((sum, s) => {
        const sessionStart = s.startedAt < from ? from : s.startedAt;
        const sessionEnd = s.lastSeenAt > to ? to : s.lastSeenAt;
        if (sessionEnd <= sessionStart) return sum;

        const overlapRatio =
          s.activeSeconds > 0
            ? Math.min(
                1,
                (sessionEnd.getTime() - sessionStart.getTime()) /
                  Math.max(1, s.lastSeenAt.getTime() - s.startedAt.getTime()),
              )
            : 0;
        return sum + Math.round(s.activeSeconds * overlapRatio);
      }, 0);

      const latest = userSessions[0] ?? null;
      const isOnline =
        latest != null && now.getTime() - latest.lastSeenAt.getTime() < ONLINE_THRESHOLD_MS;

      const platforms = [...new Set(userSessions.map((s) => s.platform))];

      return {
        userId: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        isOnline,
        platforms,
        activeSecondsToday,
        lastSeenAt: latest?.lastSeenAt?.toISOString() ?? null,
        lastPlatform: latest?.platform ?? null,
        location: this.formatLocation(latest),
      };
    });

    const onlineCount = items.filter((i) => i.isOnline).length;

    return {
      date,
      onlineCount,
      totalUsers: items.length,
      items,
    };
  }

  async getUserSessions(userId: string, fromYmd?: string, toYmd?: string) {
    const from = fromYmd ?? todayYmdKyiv();
    const to = toYmd ?? from;
    const { from: fromDate, to: toDate } = kyivDayBounds(from);
    const { to: endDate } = kyivDayBounds(to);

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, fullName: true, email: true, role: true },
    });
    if (!user) {
      return null;
    }

    const sessions = await this.prisma.userActivitySession.findMany({
      where: {
        userId,
        startedAt: { lte: endDate },
        lastSeenAt: { gte: fromDate },
      },
      orderBy: { startedAt: "desc" },
    });

    return {
      user,
      from,
      to,
      sessions: sessions.map((s) => ({
        id: s.id,
        platform: s.platform,
        startedAt: s.startedAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        activeSeconds: s.activeSeconds,
        ip: s.ip,
        userAgent: s.userAgent,
        location: this.formatLocation(s),
        lat: s.lat,
        lng: s.lng,
      })),
    };
  }

  private validCoord(value?: number): number | null {
    if (value == null || !Number.isFinite(value)) return null;
    return value;
  }

  private formatLocation(
    session: {
      platform: ClientPlatform;
      ipCity: string | null;
      ipRegion: string | null;
      ipCountry: string | null;
      lat: number | null;
      lng: number | null;
    } | null,
  ): string | null {
    if (!session) return null;
    if (session.platform === ClientPlatform.MOBILE && session.lat != null && session.lng != null) {
      return `${session.lat.toFixed(5)}, ${session.lng.toFixed(5)}`;
    }
    const parts = [session.ipCity, session.ipRegion, session.ipCountry].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : null;
  }
}
