const BIAS = 0x84;
const CLIP = 32635;

function searchExponent(sample: number): number {
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--) {
    expMask >>= 1;
  }
  return exponent;
}

export function decodeMulaw8k(payload: Buffer): Int16Array {
  const out = new Int16Array(payload.length);
  for (let i = 0; i < payload.length; i++) {
    let ulaw = (~payload[i]) & 0xff;
    const sign = ulaw & 0x80;
    const exponent = (ulaw >> 4) & 0x07;
    const mantissa = ulaw & 0x0f;
    let sample = ((mantissa << 3) + BIAS) << exponent;
    sample -= BIAS;
    out[i] = sign ? -sample : sample;
  }
  return out;
}

export function encodeMulaw8k(pcm: Int16Array): Buffer {
  const out = Buffer.allocUnsafe(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    let sample = pcm[i];
    let sign = 0;
    if (sample < 0) {
      sample = -sample;
      sign = 0x80;
    }
    if (sample > CLIP) sample = CLIP;
    sample += BIAS;
    const exponent = searchExponent(sample);
    const mantissa = (sample >> (exponent + 3)) & 0x0f;
    const ulaw = ~(sign | (exponent << 4) | mantissa) & 0xff;
    out[i] = ulaw;
  }
  return out;
}

function alawToLinear(aVal: number): number {
  const a = aVal ^ 0x55;
  const sign = a & 0x80;
  const exponent = (a & 0x70) >> 4;
  const data = a & 0x0f;
  let sample: number;
  if (exponent === 0) {
    sample = (data << 4) + 8;
  } else {
    sample = ((data << 4) + 0x108) << (exponent - 1);
  }
  return sign ? sample : -sample;
}

function linearToAlaw(sampleIn: number): number {
  let sample = sampleIn;
  let sign = 0x00;
  if (sample >= 0) {
    sign = 0x80;
  } else {
    sample = -sample - 1;
  }
  if (sample > CLIP) sample = CLIP;

  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--) {
    expMask >>= 1;
  }
  const mantissa =
    exponent === 0 ? (sample >> 4) & 0x0f : (sample >> (exponent + 3)) & 0x0f;

  const aVal = sign | (exponent << 4) | mantissa;
  return aVal ^ 0x55;
}

export function decodeAlaw8k(payload: Buffer): Int16Array {
  const out = new Int16Array(payload.length);
  for (let i = 0; i < payload.length; i++) {
    out[i] = alawToLinear(payload[i]);
  }
  return out;
}

export function encodeAlaw8k(pcm: Int16Array): Buffer {
  const out = Buffer.allocUnsafe(pcm.length);
  for (let i = 0; i < pcm.length; i++) {
    out[i] = linearToAlaw(pcm[i]);
  }
  return out;
}
