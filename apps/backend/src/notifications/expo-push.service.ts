import { Injectable, Logger } from "@nestjs/common";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const BATCH_SIZE = 100;

export type ExpoPushMessage = {
  to: string;
  title: string;
  body?: string;
  data?: Record<string, string>;
  sound?: "default" | null;
  channelId?: string;
};

type ExpoPushTicket =
  | { status: "ok"; id: string }
  | { status: "error"; message: string; details?: { error?: string } };

type ExpoPushResponse = {
  data: ExpoPushTicket[];
};

@Injectable()
export class ExpoPushService {
  private readonly logger = new Logger(ExpoPushService.name);

  async send(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
    if (messages.length === 0) return [];

    const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();
    const headers: Record<string, string> = {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    };
    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const tickets: ExpoPushTicket[] = [];
    for (let i = 0; i < messages.length; i += BATCH_SIZE) {
      const batch = messages.slice(i, i + BATCH_SIZE);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers,
          body: JSON.stringify(batch.length === 1 ? batch[0] : batch),
        });
        const body = (await res.json().catch(() => null)) as ExpoPushResponse | null;
        if (!res.ok || !body?.data) {
          this.logger.warn(
            `Expo push HTTP ${res.status}: ${body ? JSON.stringify(body) : "empty response"}`,
          );
          continue;
        }
        tickets.push(...body.data);
      } catch (err) {
        this.logger.warn(
          `Expo push request failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    return tickets;
  }

  static isInvalidTokenTicket(ticket: ExpoPushTicket): boolean {
    return (
      ticket.status === "error" &&
      (ticket.details?.error === "DeviceNotRegistered" ||
        ticket.message === "DeviceNotRegistered")
    );
  }
}
