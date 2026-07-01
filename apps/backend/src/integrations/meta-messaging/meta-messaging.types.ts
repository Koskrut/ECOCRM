import type { ConversationChannel } from "@prisma/client";

export type MetaWebhookObject = "page" | "instagram";

export type ParsedMetaInboundMessage = {
  channel: ConversationChannel;
  pageId: string;
  participantId: string;
  messageId: string;
  text: string | null;
  sentAt: Date;
  senderName?: string | null;
};

export type MetaMessagingWebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: Array<{
      sender?: { id?: string };
      recipient?: { id?: string };
      timestamp?: number;
      message?: {
        mid?: string;
        text?: string;
        is_echo?: boolean;
        attachments?: Array<{ type?: string }>;
      };
    }>;
  }>;
};
