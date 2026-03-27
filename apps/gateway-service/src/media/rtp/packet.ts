export type RtpCodec = "mulaw" | "alaw";

export type ParsedRtpPacket = {
  payloadType: number;
  sequence: number;
  timestamp: number;
  ssrc: number;
  payload: Buffer;
};

export function parseRtpPacket(buf: Buffer): ParsedRtpPacket | null {
  if (buf.length < 12) return null;
  const version = buf[0] >> 6;
  if (version !== 2) return null;
  const csrcCount = buf[0] & 0x0f;
  const headerLen = 12 + csrcCount * 4;
  if (buf.length < headerLen) return null;
  const payloadType = buf[1] & 0x7f;
  const sequence = buf.readUInt16BE(2);
  const timestamp = buf.readUInt32BE(4);
  const ssrc = buf.readUInt32BE(8);
  const payload = buf.subarray(headerLen);
  return { payloadType, sequence, timestamp, ssrc, payload };
}

export function payloadTypeForCodec(codec: RtpCodec): number {
  return codec === "alaw" ? 8 : 0;
}

export function buildRtpPacket(input: {
  sequence: number;
  timestamp: number;
  ssrc: number;
  payloadType: number;
  payload: Buffer;
  marker?: boolean;
}): Buffer {
  const header = Buffer.alloc(12);
  header[0] = 0x80; // v2
  header[1] = (input.marker ? 0x80 : 0x00) | (input.payloadType & 0x7f);
  header.writeUInt16BE(input.sequence & 0xffff, 2);
  header.writeUInt32BE(input.timestamp >>> 0, 4);
  header.writeUInt32BE(input.ssrc >>> 0, 8);
  return Buffer.concat([header, input.payload]);
}
