import { Inject, Injectable } from "@nestjs/common";
import type { AppConfig } from "../config/configuration";
import { CONFIG } from "../config/config.module";

@Injectable()
export class RtpPortAllocatorService {
  private readonly inUse = new Set<number>();

  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}

  allocate(): number {
    const start = this.config.rtpPortStart;
    const end = this.config.rtpPortEnd;
    if (end < start) {
      throw new Error("RTP_PORT_RANGE_INVALID");
    }
    for (let port = start; port <= end; port++) {
      if (!this.inUse.has(port)) {
        this.inUse.add(port);
        return port;
      }
    }
    throw new Error("RTP_PORT_RANGE_EXHAUSTED");
  }

  release(port: number): void {
    this.inUse.delete(port);
  }
}
