import dgram from "dgram";
import { buildRtpPacket, parseRtpPacket, type ParsedRtpPacket } from "./packet";

export class FakeRtpPeer {
  private readonly socket = dgram.createSocket("udp4");
  private seq = 1;
  private ts = 160;
  private readonly ssrc = 0x11223344;
  private readonly received: ParsedRtpPacket[] = [];

  async bind(): Promise<number> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once("error", reject);
      this.socket.bind(0, "127.0.0.1", () => {
        this.socket.off("error", reject);
        resolve();
      });
    });
    this.socket.on("message", (msg) => {
      const parsed = parseRtpPacket(msg);
      if (parsed) this.received.push(parsed);
    });
    const addr = this.socket.address();
    return typeof addr === "string" ? 0 : addr.port;
  }

  async sendFrame(targetPort: number, payload: Buffer, payloadType = 0): Promise<void> {
    const packet = buildRtpPacket({
      sequence: this.seq++,
      timestamp: this.ts,
      ssrc: this.ssrc,
      payloadType,
      payload,
    });
    this.ts += 160;
    await new Promise<void>((resolve, reject) => {
      this.socket.send(packet, targetPort, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
    });
  }

  takeReceived(): ParsedRtpPacket[] {
    const out = [...this.received];
    this.received.length = 0;
    return out;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.socket.close(() => resolve()));
  }
}
