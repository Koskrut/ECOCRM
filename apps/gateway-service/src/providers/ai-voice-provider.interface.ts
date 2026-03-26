export type AiSessionHandle = {
  openaiSessionId: string;
};

export interface AiVoiceProvider {
  createSession(input: { externalSessionId: string; attemptId: string }): Promise<AiSessionHandle>;

  sendContext(handle: AiSessionHandle, context: Record<string, unknown>): Promise<void>;

  startConversation(handle: AiSessionHandle): Promise<void>;

  handleToolInvocation(handle: AiSessionHandle, toolName: string, args: unknown): Promise<unknown>;

  closeSession(handle: AiSessionHandle): Promise<void>;
}
