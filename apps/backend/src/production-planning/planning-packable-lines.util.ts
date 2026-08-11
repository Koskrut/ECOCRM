/** Kits that can be assembled from ПФ already on hand (posted 1C snapshot). */
export function isPackableFromParts(maxFromParts: number): boolean {
  return maxFromParts > 0;
}

/** Drop kits with no part stock before persisting a packing list. */
export function filterPackableProposedLines<T extends { maxFromParts: number }>(lines: T[]): T[] {
  return lines.filter((line) => isPackableFromParts(line.maxFromParts));
}
