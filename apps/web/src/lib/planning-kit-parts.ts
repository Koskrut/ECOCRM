/** Part is short for a pack request when on-hand is below gross need (not merely BOM bottleneck). */
export function isKitPartShort(available: number, need: number): boolean {
  return available < need;
}
