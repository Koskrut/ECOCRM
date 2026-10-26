export type PackingListExcelLine = {
  kitSku: string;
  kitName: string;
  /** Component article codes only, in BOM display order. */
  partSkus: string[];
  need: number;
  canAssemble: number;
  inRequest: number;
  missingPart: string;
  why: string;
};

/** One column per component SKU. Shorter kits leave the extra part cells empty. */
export function buildPackingListExcelAoA(
  lines: PackingListExcelLine[],
): Array<Array<string | number>> {
  const partCount = lines.reduce((max, line) => Math.max(max, line.partSkus.length), 0);
  const partHeaders = Array.from({ length: partCount }, (_, i) => `part${i + 1}`);
  const header = [
    "kitSku",
    "kitName",
    ...partHeaders,
    "need",
    "canAssemble",
    "inRequest",
    "missingPart",
    "why",
  ];
  const body = lines.map((line) => [
    line.kitSku,
    line.kitName,
    ...partHeaders.map((_, i) => line.partSkus[i] ?? ""),
    line.need,
    line.canAssemble,
    line.inRequest,
    line.missingPart,
    line.why,
  ]);
  return [header, ...body];
}
