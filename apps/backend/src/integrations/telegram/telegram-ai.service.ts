import { Injectable, NotFoundException } from "@nestjs/common";
import { MessageDirection } from "@prisma/client";
import OpenAI from "openai";
import { PrismaService } from "../../prisma/prisma.service";
import { SettingsService } from "../../settings/settings.service";

const MAX_MESSAGES = 25;
const MAX_SUGGESTIONS = 3;

@Injectable()
export class TelegramAiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * Suggest 1–3 short reply texts for a conversation using the last messages as context.
   * Returns empty array if AI is disabled or not configured.
   */
  async suggestReplies(
    conversationId: string,
    options?: { maxSuggestions?: number },
  ): Promise<string[]> {
    const config = await this.settings.getTelegramAiConfig();
    if (!config.enabled || !config.openaiApiKey) {
      return [];
    }

    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        contact: { select: { firstName: true, lastName: true } },
        lead: { select: { firstName: true, lastName: true, fullName: true } },
      },
    });
    if (!conv) throw new NotFoundException("Conversation not found");

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { sentAt: "asc" },
      take: MAX_MESSAGES,
      select: { direction: true, text: true, sentAt: true },
    });

    const contactName = conv.contact
      ? [conv.contact.firstName, conv.contact.lastName].filter(Boolean).join(" ") || "Клієнт"
      : conv.lead?.fullName || [conv.lead?.firstName, conv.lead?.lastName].filter(Boolean).join(" ") || "Клієнт";

    const historyLines = messages.map((m) => {
      const who = m.direction === MessageDirection.INBOUND ? contactName : "Менеджер";
      const text = (m.text || "").trim() || "(медіа)";
      return `${who}: ${text}`;
    });
    const history = historyLines.join("\n") || "Немає повідомлень.";
    const maxSuggestions = Math.min(options?.maxSuggestions ?? MAX_SUGGESTIONS, 5);

    const systemPrompt = `Ти асистент менеджера в CRM. За останніми повідомленнями чату запропонуй ${maxSuggestions} короткі варіанти відповіді менеджера клієнту. Відповідай тільки варіантами тексту, без пояснень. Кожен варіант з нового рядка. Мова: українська. Тон: доброзичливий, по ділу. Не вигадуй факти про компанію.`;
    const userPrompt = `Чат:\n${history}\n\nЗапропонуй ${maxSuggestions} варіанти відповіді (кожен з нового рядка):`;

    const client = new OpenAI({ apiKey: config.openaiApiKey });
    const completion = await client.chat.completions.create({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 400,
      temperature: 0.6,
    });

    const content = completion.choices[0]?.message?.content?.trim();
    if (!content) return [];

    const lines = content
      .split(/\n+/)
      .map((s) => s.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter((s) => s.length > 0 && s.length <= 500);
    return lines.slice(0, maxSuggestions);
  }
}
