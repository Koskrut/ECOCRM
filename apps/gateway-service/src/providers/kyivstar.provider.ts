import { Injectable, Logger } from "@nestjs/common";
import type { TelephonyCallHandle, TelephonyProvider } from "./telephony-provider.interface";

/**
 * Kyivstar telephony integration — NOT wired in MVP.
 * Real SIP/media bridge requires confirmed API + infra; keep as honest stub.
 */
@Injectable()
export class KyivstarTelephonyProvider implements TelephonyProvider {
  private readonly logger = new Logger(KyivstarTelephonyProvider.name);

  async createOutboundLeg(_input: {
    externalSessionId: string;
    e164Phone: string;
    attemptId: string;
  }): Promise<TelephonyCallHandle> {
    this.logger.warn("Kyivstar createOutboundLeg: stub — outbound leg not connected to carrier API");
    throw new Error("KYIVSTAR_TELEPHONY_NOT_IMPLEMENTED");
  }

  async getCallStatus(_providerCallId: string): Promise<{ status: string }> {
    throw new Error("KYIVSTAR_TELEPHONY_NOT_IMPLEMENTED");
  }

  async transferCall(_providerCallId: string, _target: string): Promise<void> {
    throw new Error("KYIVSTAR_TELEPHONY_NOT_IMPLEMENTED");
  }

  async hangupCall(_providerCallId: string): Promise<void> {
    throw new Error("KYIVSTAR_TELEPHONY_NOT_IMPLEMENTED");
  }
}
