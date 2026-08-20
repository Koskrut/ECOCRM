import test from "node:test";
import assert from "node:assert/strict";
import { ProductKind } from "@prisma/client";
import { rankTodaySuggestedActions } from "../planning-today-suggested-actions.util";

test("pack first when parts cover at least part of kit need", () => {
  assert.deepEqual(
    rankTodaySuggestedActions({
      kind: ProductKind.KIT,
      kitNeed: 100,
      maxFromParts: 50,
      canAssemble: 50,
      inCanPack: false,
      hasFactoryRec: false,
    }),
    ["pack", "production"],
  );
});

test("pack only when parts fully cover kit need", () => {
  assert.deepEqual(
    rankTodaySuggestedActions({
      kind: ProductKind.KIT,
      kitNeed: 80,
      maxFromParts: 120,
      canAssemble: 80,
      inCanPack: true,
      hasFactoryRec: true,
    }),
    ["pack"],
  );
});

test("factory when no parts and factory recommendation exists", () => {
  assert.deepEqual(
    rankTodaySuggestedActions({
      kind: ProductKind.KIT,
      kitNeed: 40,
      maxFromParts: 0,
      canAssemble: 0,
      inCanPack: false,
      hasFactoryRec: true,
    }),
    ["production", "factory"],
  );
});

test("production only for part line without factory rec", () => {
  assert.deepEqual(
    rankTodaySuggestedActions({
      kind: ProductKind.PART,
      kitNeed: 25,
      maxFromParts: 0,
      canAssemble: 0,
      inCanPack: false,
      hasFactoryRec: false,
    }),
    ["production"],
  );
});
