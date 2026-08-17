/** Kits that can be assembled from ПФ already on hand (posted 1C snapshot). */
export function isPackableFromParts(maxFromParts: number): boolean {
  return maxFromParts > 0;
}

/** Need this week, but no inventoried BOM parts / WIP to pack. */
export function isBlockedPackLine(line: { maxFromParts: number; targetPack?: number }): boolean {
  return (line.targetPack ?? 0) > 0 && line.maxFromParts <= 0;
}

/**
 * Keep kits that go into this week's request, plus blocked need (qty 0)
 * so Friday review still shows «нужно, но нельзя».
 */
export function filterPackableProposedLines<
  T extends { maxFromParts: number; targetPack?: number },
>(lines: T[]): T[] {
  return lines.filter((line) => isPackableFromParts(line.maxFromParts) || isBlockedPackLine(line));
}
