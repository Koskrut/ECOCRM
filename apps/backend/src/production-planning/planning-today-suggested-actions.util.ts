import { ProductKind } from "@prisma/client";

export type TodaySuggestedAction = "pack" | "production" | "factory";

export type RankTodaySuggestedActionsInput = {
  kind: ProductKind;
  kitNeed: number;
  maxFromParts: number;
  canAssemble: number;
  inCanPack: boolean;
  hasFactoryRec: boolean;
};

/** Rank operational next steps for a burning MRP line (pure, no DB). */
export function rankTodaySuggestedActions(input: RankTodaySuggestedActionsInput): TodaySuggestedAction[] {
  const actions: TodaySuggestedAction[] = [];
  const { kitNeed, maxFromParts, canAssemble, inCanPack, hasFactoryRec, kind } = input;

  if (canAssemble > 0 || maxFromParts > 0 || inCanPack) {
    actions.push("pack");
  }

  const partsInsufficient = maxFromParts < kitNeed;
  if ((kind === ProductKind.KIT || kind === ProductKind.PART) && partsInsufficient) {
    actions.push("production");
  }

  if (hasFactoryRec && maxFromParts === 0) {
    actions.push("factory");
  }

  return actions;
}
