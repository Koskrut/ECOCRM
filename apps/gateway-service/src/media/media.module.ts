import { Global, Module } from "@nestjs/common";
import { MockMediaBridgeService } from "./mock-media-bridge.service";
import { RtpOpenAiMediaBridgeService } from "./rtp-openai-media-bridge.service";
import { RtpPortAllocatorService } from "./rtp-port-allocator.service";

@Global()
@Module({
  providers: [
    RtpPortAllocatorService,
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
  exports: [
    "MediaBridgeMock",
    "MediaBridgeReal",
    RtpPortAllocatorService,
    MockMediaBridgeService,
    RtpOpenAiMediaBridgeService,
  ],
})
export class MediaModule {}
