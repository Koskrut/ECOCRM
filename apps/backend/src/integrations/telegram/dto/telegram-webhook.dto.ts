/**
 * Webhook body is Telegram Update JSON. We don't validate structure with class-validator
 * (payload comes from Telegram); minimal typing in telegram.types.ts.
 */
export type TelegramWebhookBody = Record<string, unknown>;
