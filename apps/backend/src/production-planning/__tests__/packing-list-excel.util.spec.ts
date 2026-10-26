import test from "node:test";
import assert from "node:assert/strict";
import { buildPackingListExcelAoA } from "../packing-list-excel.util";

test("packing list excel puts each component SKU in its own column", () => {
  const aoa = buildPackingListExcelAoA([
    {
      kitSku: "04.045",
      kitName: "Платформа",
      partSkus: ["MG-PF-NH-CAD_CAM-4.0x1.5", "MG-SF-M2.0"],
      need: 199,
      canAssemble: 414,
      inRequest: 199,
      missingPart: "",
      why: "stock",
    },
    {
      kitSku: "08.042",
      kitName: "Гвинт",
      partSkus: ["ND-SF-TB"],
      need: 10,
      canAssemble: 4,
      inRequest: 4,
      missingPart: "ND-TB",
      why: "orders",
    },
  ]);

  assert.deepEqual(aoa[0], [
    "kitSku",
    "kitName",
    "part1",
    "part2",
    "need",
    "canAssemble",
    "inRequest",
    "missingPart",
    "why",
  ]);
  assert.deepEqual(aoa[1], [
    "04.045",
    "Платформа",
    "MG-PF-NH-CAD_CAM-4.0x1.5",
    "MG-SF-M2.0",
    199,
    414,
    199,
    "",
    "stock",
  ]);
  assert.deepEqual(aoa[2], [
    "08.042",
    "Гвинт",
    "ND-SF-TB",
    "",
    10,
    4,
    4,
    "ND-TB",
    "orders",
  ]);
});

test("packing list excel has no part columns when no kit has components", () => {
  const aoa = buildPackingListExcelAoA([
    {
      kitSku: "P-1",
      kitName: "Part",
      partSkus: [],
      need: 1,
      canAssemble: 1,
      inRequest: 1,
      missingPart: "",
      why: "stock",
    },
  ]);
  assert.deepEqual(aoa[0], [
    "kitSku",
    "kitName",
    "need",
    "canAssemble",
    "inRequest",
    "missingPart",
    "why",
  ]);
});
