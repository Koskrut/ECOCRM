const { describe, it } = require("node:test");
const assert = require("node:assert");
const XLSX = require("xlsx");
const { StockUploadService } = require("../stock-upload.service");
const { buildStockSkuIndex, resolveStockSkuToProduct } = require("../stock-sku-normalizer");

const warehouses = [
  { id: "wh-dnipro", name: "Днепр" },
  { id: "wh-lviv", name: "Львов" },
  { id: "wh-kyiv", name: "Киев" },
  { id: "wh-odesa", name: "Одесса" },
  { id: "wh-lutsk", name: "Луцьк" },
  { id: "wh-khm", name: "Хмельницький" },
];

function buildWorkbookBuffer(rows, cellOverrides) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  if (cellOverrides) {
    for (const [addr, cell] of Object.entries(cellOverrides)) {
      ws[addr] = cell;
    }
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
}

describe("stock-upload.service", () => {
  const service = new StockUploadService();

  it("00.100 as Excel number 0.1 with formatted text → Днепр=8 and resolves to 00.100", () => {
    const buffer = buildWorkbookBuffer(
      [["Артикул", "Днепр", "Львов", "Киев"], [null, 8, 0, 0]],
      {
        A2: { t: "n", v: 0.1, w: "00.100", z: "00.000" },
      },
    );
    const entries = service.parseExcelBufferByWarehouses(buffer, warehouses);
    const dnipro = entries.find((e) => e.warehouseId === "wh-dnipro");
    assert.ok(dnipro);
    assert.strictEqual(dnipro.fileSku, "0.100");
    assert.strictEqual(dnipro.qty, 8);

    const index = buildStockSkuIndex([{ id: "p-001", sku: "00.100" }]);
    const ref = resolveStockSkuToProduct(dnipro.sku, index);
    assert.strictEqual(ref?.sku, "00.100");
    assert.strictEqual(ref?.id, "p-001");
  });

  it("01.030 → Днепр=22, Львов=8, Киев=2", () => {
    const buffer = buildWorkbookBuffer([
      ["Артикул", "Днепр", "Львов", "Киев"],
      ["01.030", 22, 8, 2],
    ]);
    const entries = service.parseExcelBufferByWarehouses(buffer, warehouses);
    const qtyAt = (whId) => entries.find((e) => e.warehouseId === whId)?.qty;
    assert.strictEqual(qtyAt("wh-dnipro"), 22);
    assert.strictEqual(qtyAt("wh-lviv"), 8);
    assert.strictEqual(qtyAt("wh-kyiv"), 2);
  });

  it("resolved product id from 0.1 row stays in upload set (reset must not zero 00.100)", () => {
    const buffer = buildWorkbookBuffer([["Артикул", "Днепр"], [null, 5]], {
      A2: { t: "n", v: 0.1, w: "00.100" },
    });
    const entries = service.parseExcelBufferByWarehouses(buffer, [warehouses[0]]);
    const index = buildStockSkuIndex([{ id: "p-001", sku: "00.100" }]);
    const productIds = new Set();
    for (const e of entries) {
      const ref = resolveStockSkuToProduct(e.sku, index);
      if (ref) productIds.add(ref.id);
    }
    assert.ok(productIds.has("p-001"));
    assert.strictEqual(productIds.size, 1);
  });

  it("matches warehouse column aliases (Луцк → Луцьк, Kyiv → Киев)", () => {
    const bufferLutsk = buildWorkbookBuffer([
      ["Артикул", "Луцк"],
      ["01.030", 3],
    ]);
    const matchedLutsk = service.getMatchedWarehouseColumns(bufferLutsk, [warehouses[4]]);
    assert.strictEqual(matchedLutsk.length, 1);
    assert.strictEqual(matchedLutsk[0].warehouseName, "Луцьк");

    const bufferKyiv = buildWorkbookBuffer([
      ["Артикул", "Kyiv"],
      ["01.030", 2],
    ]);
    const matchedKyiv = service.getMatchedWarehouseColumns(bufferKyiv, [warehouses[2]]);
    assert.strictEqual(matchedKyiv.length, 1);
    assert.strictEqual(matchedKyiv[0].warehouseName, "Киев");
  });

  it("does not map empty header columns to warehouses", () => {
    const buffer = buildWorkbookBuffer([
      ["Артикул", "", "Днепр"],
      ["01.030", 99, 1],
    ]);
    const entries = service.parseExcelBufferByWarehouses(buffer, [warehouses[0]]);
    assert.strictEqual(entries.length, 1);
    assert.strictEqual(entries[0].qty, 1);
    assert.strictEqual(entries[0].warehouseId, "wh-dnipro");
  });

  it("01.011 as Excel number 1.011 resolves to product 01.011", () => {
    const buffer = buildWorkbookBuffer([["Артикул", "Днепр"], [null, 4]], {
      A2: { t: "n", v: 1.011, w: "01.011" },
    });
    const entries = service.parseExcelBufferByWarehouses(buffer, [warehouses[0]]);
    const index = buildStockSkuIndex([{ id: "p-011", sku: "01.011" }]);
    const ref = resolveStockSkuToProduct(entries[0].sku, index);
    assert.strictEqual(ref?.sku, "01.011");
  });
});
