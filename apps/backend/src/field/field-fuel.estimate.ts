import { Prisma } from "@prisma/client";

/** Pure estimate for compensation ₴ (not receipt totals). */
export function estimateFuelFromKm(
  compensationKm: number | null | undefined,
  profile: {
    fuelLitersPer100km: number;
    fuelPricePerLiter: Prisma.Decimal | number | string | null | undefined;
  },
): { litersEstimated: number | null; amountEstimated: Prisma.Decimal | null } {
  if (compensationKm == null || !Number.isFinite(compensationKm)) {
    return { litersEstimated: null, amountEstimated: null };
  }
  const liters = (compensationKm * profile.fuelLitersPer100km) / 100;
  if (!Number.isFinite(liters)) {
    return { litersEstimated: null, amountEstimated: null };
  }
  const litersRounded = Math.round(liters * 1000) / 1000;
  const rawPrice = profile.fuelPricePerLiter;
  if (rawPrice == null || rawPrice === "") {
    return { litersEstimated: litersRounded, amountEstimated: null };
  }
  const priceNum =
    typeof rawPrice === "number" ? rawPrice : Number(String(rawPrice));
  if (!Number.isFinite(priceNum) || priceNum <= 0) {
    return { litersEstimated: litersRounded, amountEstimated: null };
  }
  const amount = new Prisma.Decimal(litersRounded).mul(priceNum);
  return { litersEstimated: litersRounded, amountEstimated: amount };
}
