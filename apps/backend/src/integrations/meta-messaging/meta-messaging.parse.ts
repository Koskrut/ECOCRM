import { ConversationChannel } from "@prisma/client";
import type { MetaMessagingWebhookBody, ParsedMetaInboundMessage } from "./meta-messaging.types";

export function resolveMetaChannelFromObject(object: string | undefined): ConversationChannel | null {
  if (object === "instagram") return ConversationChannel.INSTAGRAM;
  if (object === "page") return ConversationChannel.FACEBOOK;
  return null;
}

/**
 * Extract inbound text/media messages from Meta Messenger Platform webhook payload.
 * Skips echo messages (outbound copies) and non-message events.
 */
export function parseMetaInboundMessages(body: MetaMessagingWebhookBody): ParsedMetaInboundMessage[] {
  const channel = resolveMetaChannelFromObject(body.object);
  if (!channel || !Array.isArray(body.entry)) return [];

  const out: ParsedMetaInboundMessage[] = [];

  for (const entry of body.entry) {
    const pageId = entry.id != null ? String(entry.id) : "";
    if (!pageId || !Array.isArray(entry.messaging)) continue;

    for (const event of entry.messaging) {
      const msg = event.message;
      if (!msg?.mid || msg.is_echo) continue;

      const participantId = event.sender?.id != null ? String(event.sender.id) : "";
      if (!participantId) continue;

      const text =
        typeof msg.text === "string" && msg.text.trim()
          ? msg.text.trim()
          : msg.attachments?.length
            ? `[${msg.attachments[0]?.type ?? "media"}]`
            : null;
      if (!text) continue;

      const ts = event.timestamp;
      const sentAt =
        typeof ts === "number" && Number.isFinite(ts) ? new Date(ts) : new Date();

      out.push({
        channel,
        pageId,
        participantId,
        messageId: String(msg.mid),
        text,
        sentAt,
      });
    }
  }

  return out;
}
