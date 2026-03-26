export type AiSessionHandle = {
  openaiSessionId: string;
};

export type AiAudioChunk = {
  pcm16leBase64: string;
  sampleRateHz: number;
  channels: 1 | 2;
};

export interface AiVoiceProvider {
  createSession(input: { externalSessionId: string; attemptId: string }): Promise<AiSessionHandle>;

  sendContext(handle: AiSessionHandle, context: Record<string, unknown>): Promise<void>;

  startConversation(handle: AiSessionHandle): Promise<void>;

  pushAudioInput(handle: AiSessionHandle, audio: AiAudioChunk): Promise<void>;

  onAudioOutput(handle: AiSessionHandle, listener: (audio: AiAudioChunk) => void): () => void;

  handleToolInvocation(handle: AiSessionHandle, toolName: string, args: unknown): Promise<unknown>;

  closeSession(handle: AiSessionHandle): Promise<void>;
}
