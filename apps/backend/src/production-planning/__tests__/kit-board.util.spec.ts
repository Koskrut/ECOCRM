import test from "node:test";
import assert from "node:assert/strict";
import { buildKitBoard, groupSnapshotStock, kitNeed, kitsOnWarehouse } from "../kit-board.util";

const warehouses = [
  { id: "a", name: "A" },
  { id: "b", name: "B" },
];

test("kitNeed is zero without sales and does not double-count stock", () => {
  assert.equal(kitNeed(0, 10, 1), 0);
  assert.equal(kitNeed(8, 10, 1), 0);
  assert.equal(kitNeed(10, 2, 1), 8);
  assert.equal(kitNeed(10.2, 10, 1), 1);
});

test("parts on different warehouses do not add up into one kit", () => {
  const parts = [
    {
      productId: "p1",
      sku: "P1",
      name: "P1",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: true,
      qtyByWarehouse: { a: 5, b: 0 },
    },
    {
      productId: "p2",
      sku: "P2",
      name: "P2",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: true,
      qtyByWarehouse: { a: 0, b: 5 },
    },
  ];
  assert.equal(kitsOnWarehouse(parts, "a"), 0);
  assert.equal(kitsOnWarehouse(parts, "b"), 0);
});

test("packaging does not limit how many kits one warehouse can build", () => {
  const parts = [
    {
      productId: "metal",
      sku: "M",
      name: "Metal",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: true,
      qtyByWarehouse: { a: 4 },
    },
    {
      productId: "pkg",
      sku: "PKG:blister",
      name: "Blister",
      qtyPerKit: 1,
      scrapPct: 0,
      constrains: false,
      qtyByWarehouse: { a: 0 },
    },
  ];
  assert.equal(kitsOnWarehouse(parts, "a"), 4);
});

test("board packs only the sales gap and gives a shared part to the larger need", () => {
  const part = {
    productId: "bolt",
    sku: "BOLT",
    name: "Bolt",
    qtyPerKit: 1,
    scrapPct: 0,
    constrains: true,
    qtyByWarehouse: { a: 100, b: 0 },
  };
  const rows = buildKitBoard({
    coverMonths: 1,
    warehouses,
    kits: [
      {
        productId: "kit-b",
        sku: "B",
        name: "Kit B",
        qtyByWarehouse: { a: 0, b: 0 },
        avgMonthlySold: 50,
        parts: [part],
      },
      {
        productId: "kit-a",
        sku: "A",
        name: "Kit A",
        qtyByWarehouse: { a: 0, b: 0 },
        avgMonthlySold: 80,
        parts: [part],
      },
      {
        productId: "kit-ok",
        sku: "OK",
        name: "Covered",
        qtyByWarehouse: { a: 40, b: 0 },
        avgMonthlySold: 10,
        parts: [part],
      },
      {
        productId: "kit-nosales",
        sku: "Z",
        name: "No sales",
        qtyByWarehouse: { a: 0, b: 0 },
        avgMonthlySold: 0,
        parts: [part],
      },
    ],
  });

  const bySku = new Map(rows.map((row) => [row.sku, row]));
  assert.equal(bySku.get("A")?.need, 80);
  assert.equal(bySku.get("A")?.canAssemble, 100);
  assert.equal(bySku.get("A")?.toPack, 80);
  assert.equal(bySku.get("A")?.tone, "pack");
  assert.equal(bySku.get("A")?.toPackWarehouseId, "a");

  assert.equal(bySku.get("B")?.canAssemble, 100);
  assert.equal(bySku.get("B")?.toPack, 20);
  assert.equal(bySku.get("B")?.tone, "pack");

  assert.equal(bySku.get("OK")?.need, 0);
  assert.equal(bySku.get("OK")?.toPack, 0);
  assert.equal(bySku.get("OK")?.tone, "enough");

  assert.equal(bySku.get("Z")?.toPack, 0);
  assert.equal(bySku.get("Z")?.tone, "no_sales");
  assert.equal(rows[0]?.sku, "A");
});

test("stock columns follow the file warehouse names, even when they are not in the CRM directory", () => {
  const grouped = groupSnapshotStock([
    {
      productId: "kit",
      qty: 4,
      warehouseId: null,
      warehouseRaw: "44 Склад Готової продукції (СУПРЕКС)",
    },
    {
      productId: "kit",
      qty: 2,
      warehouseId: null,
      warehouseRaw: "12 Склад Suprex",
    },
    {
      productId: "part",
      qty: 9,
      warehouseId: null,
      warehouseRaw: "12 Склад Suprex",
    },
    {
      productId: "part",
      qty: 1,
      warehouseId: "wh-kyiv",
      warehouseRaw: null,
      warehouseName: "Киев",
    },
    {
      productId: "part",
      qty: 0,
      warehouseId: null,
      warehouseRaw: "Порожній",
    },
  ]);

  assert.deepEqual(
    grouped.warehouses.map((w) => w.name),
    ["12 Склад Suprex", "44 Склад Готової продукції (СУПРЕКС)", "Киев"],
  );
  assert.equal(grouped.qtyByProduct.get("kit")?.[grouped.warehouses[0]!.id], 2);
  assert.equal(grouped.qtyByProduct.get("part")?.[grouped.warehouses[0]!.id], 9);
});

test("scrap reduces how many kits a part can cover", () => {
  const n = kitsOnWarehouse(
    [
      {
        productId: "p",
        sku: "P",
        name: "P",
        qtyPerKit: 2,
        scrapPct: 50,
        constrains: true,
        qtyByWarehouse: { a: 10 },
      },
    ],
    "a",
  );
  assert.equal(n, 3);
});
