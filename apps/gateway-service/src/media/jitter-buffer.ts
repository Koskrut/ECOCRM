export type JitterPacket = {
  sequence: number;
  timestamp: number;
  payload: Buffer;
  receivedAtMs: number;
};

export type JitterPopResult =
  | { kind: "frame"; packet: JitterPacket }
  | { kind: "loss" }
  | { kind: "empty" };

export class AdaptiveJitterBuffer {
  private readonly packets = new Map<number, JitterPacket>();
  private playoutSequence: number | null = null;
  private started = false;
  private targetMs: number;
  private readonly minMs: number;
  private readonly maxMs: number;
  private readonly frameMs: number;
  private readonly maxPackets: number;
  private drops = 0;

  constructor(input?: {
    targetMs?: number;
    minMs?: number;
    maxMs?: number;
    frameMs?: number;
    maxPackets?: number;
  }) {
    this.targetMs = input?.targetMs ?? 60;
    this.minMs = input?.minMs ?? 50;
    this.maxMs = input?.maxMs ?? 100;
    this.frameMs = input?.frameMs ?? 20;
    this.maxPackets = input?.maxPackets ?? 120;
  }

  push(packet: JitterPacket): void {
    if (this.playoutSequence === null) {
      this.playoutSequence = packet.sequence;
    }
    if (this.playoutSequence !== null && this.seqDiff(packet.sequence, this.playoutSequence) < -4) {
      this.drops++;
      return;
    }
    this.packets.set(packet.sequence, packet);
    if (this.packets.size > this.maxPackets) {
      const oldest = [...this.packets.keys()].sort((a, b) => this.seqDiff(a, b))[0];
      if (oldest !== undefined) {
        this.packets.delete(oldest);
        this.drops++;
      }
    }
  }

  pop(nowMs: number): JitterPopResult {
    void nowMs;
    if (this.playoutSequence === null) return { kind: "empty" };
    if (!this.started) {
      if (this.bufferedMs() < this.targetMs) {
        return { kind: "empty" };
      }
      this.started = true;
    }

    const seq = this.playoutSequence;
    this.playoutSequence = (this.playoutSequence + 1) & 0xffff;
    const packet = this.packets.get(seq);
    if (packet) {
      this.packets.delete(seq);
      return { kind: "frame", packet };
    }
    this.drops++;
    this.autoTune();
    return { kind: "loss" };
  }

  bufferedMs(): number {
    return this.packets.size * this.frameMs;
  }

  queueDepth(): number {
    return this.packets.size;
  }

  packetDrops(): number {
    return this.drops;
  }

  private autoTune(): void {
    if (this.drops > 0 && this.drops % 25 === 0) {
      this.targetMs = Math.min(this.maxMs, this.targetMs + 10);
    } else if (this.packets.size > this.maxPackets / 2 && this.targetMs > this.minMs) {
      this.targetMs = Math.max(this.minMs, this.targetMs - 5);
    }
  }

  private seqDiff(a: number, b: number): number {
    const diff = (a - b + 65536) % 65536;
    return diff > 32767 ? diff - 65536 : diff;
  }
}
