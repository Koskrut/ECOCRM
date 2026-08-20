const HEX: readonly string[] = Array.from({ length: 256 }, (_, i) =>
  i.toString(16).padStart(2, "0"),
);

function fallbackUuidV4(): string {
  const rnd = new Uint8Array(16);
  for (let i = 0; i < rnd.length; i++) {
    rnd[i] = Math.floor(Math.random() * 256);
  }
  rnd[6] = (rnd[6]! & 0x0f) | 0x40;
  rnd[8] = (rnd[8]! & 0x3f) | 0x80;
  return (
    `${HEX[rnd[0]!]}${HEX[rnd[1]!]}${HEX[rnd[2]!]}${HEX[rnd[3]!]}-` +
    `${HEX[rnd[4]!]}${HEX[rnd[5]!]}-` +
    `${HEX[rnd[6]!]}${HEX[rnd[7]!]}-` +
    `${HEX[rnd[8]!]}${HEX[rnd[9]!]}-` +
    `${HEX[rnd[10]!]}${HEX[rnd[11]!]}${HEX[rnd[12]!]}${HEX[rnd[13]!]}${HEX[rnd[14]!]}${HEX[rnd[15]!]}`
  );
}

export function newUuidV4(): string {
  const g = globalThis as { crypto?: { randomUUID?: () => string } };
  if (typeof g.crypto?.randomUUID === "function") {
    return g.crypto.randomUUID();
  }
  return fallbackUuidV4();
}
