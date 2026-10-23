import type { ConversationChannel } from "@prisma/client";

export type MetaWebhookObject = "page" | "instagram";

export type MetaAdReferral = {
  ad_id?: string;
  campaign_id?: string;
  adset_id?: string;
  source?: string;
  ads_context_data?: { ad_title?: string };
};

export type ParsedMetaInboundMessage = {
  channel: ConversationChannel;
  pageId: string;
  participantId: string;
  messageId: string;
  text: string | null;
  sentAt: Date;
  senderName?: string | null;
  referral?: {
    adId: string | null;
    campaignId: string | null;
    adsetId: string | null;
    adName: string | null;
  } | null;
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
        referral?: MetaAdReferral;
      };
      referral?: MetaAdReferral;
    }>;
  }>;
};
