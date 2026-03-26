import { Global, Module } from "@nestjs/common";
import { MockMediaBridgeService } from "./mock-media-bridge.service";
import { RtpOpenAiMediaBridgeService } from "./rtp-openai-media-bridge.service";

@Global()
@Module({
  providers: [
    MockMediaBridgeService,
    RtpOpenAiMediaBridgeService,
    {
      provide: "MediaBridgeMock",
      useExisting: MockMediaBridgeService,
    },
    {
      provide: "MediaBridgeReal",
      useExisting: RtpOpenAiMediaBridgeService,
    },
  ],
  exports: ["MediaBridgeMock", "MediaBridgeReal", MockMediaBridgeService, RtpOpenAiMediaBridgeService],
})
export class MediaModule {}
