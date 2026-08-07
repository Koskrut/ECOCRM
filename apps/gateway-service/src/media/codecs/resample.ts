export function resample8kTo16k(input: Int16Array): Int16Array {
  if (input.length === 0) return new Int16Array(0);
  const out = new Int16Array(input.length * 2);
  for (let i = 0; i < input.length; i++) {
    const cur = input[i];
    const next = i + 1 < input.length ? input[i + 1] : cur;
    out[i * 2] = cur;
    out[i * 2 + 1] = ((cur + next) / 2) | 0;
  }
  return out;
}

export function resample16kTo8k(input: Int16Array): Int16Array {
  if (input.length < 2) return new Int16Array(0);
  const outLen = Math.floor(input.length / 2);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const a = input[i * 2];
    const b = input[i * 2 + 1];
    out[i] = ((a + b) / 2) | 0;
  }
  return out;
}

/** Upsample 8 kHz mono PCM16 to 24 kHz (OpenAI Realtime GA input rate). */
export function resample8kTo24k(input: Int16Array): Int16Array {
  if (input.length === 0) return new Int16Array(0);
  const out = new Int16Array(input.length * 3);
  for (let i = 0; i < input.length; i++) {
    const cur = input[i];
    const next = i + 1 < input.length ? input[i + 1] : cur;
    out[i * 3] = cur;
    out[i * 3 + 1] = ((cur * 2 + next) / 3) | 0;
    out[i * 3 + 2] = ((cur + next * 2) / 3) | 0;
  }
  return out;
}

/** Downsample 24 kHz mono PCM16 to 8 kHz for G.711 RTP. */
export function resample24kTo8k(input: Int16Array): Int16Array {
  if (input.length < 3) return new Int16Array(0);
  const outLen = Math.floor(input.length / 3);
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const a = input[i * 3];
    const b = input[i * 3 + 1] ?? a;
    const c = input[i * 3 + 2] ?? b;
    out[i] = ((a + b + c) / 3) | 0;
  }
  return out;
}

export function pcm16FromBase64(base64: string): Int16Array {
  const raw = Buffer.from(base64, "base64");
  const samples = new Int16Array(Math.floor(raw.length / 2));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = raw.readInt16LE(i * 2);
  }
  return samples;
}

export function pcm16ToBase64(samples: Int16Array): string {
  const raw = Buffer.allocUnsafe(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    raw.writeInt16LE(samples[i], i * 2);
  }
  return raw.toString("base64");
}
