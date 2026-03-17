/**
 * Google Apps Script: Web App для приёма заказов из CRM (POST JSON).
 * Разверните как Web App, URL вставьте в настройки CRM «URL webhook таблиці».
 *
 * Порядок колонок в первом листе (строго):
 * 1. Дата
 * 2. ID сделки в 1С
 * 3. ответственный (как Id контакта в 1С)
 * 4. Код контрагента в 1С
 * 5. форма оплаты
 * 6. ФОП
 * 7. Склад
 * 8. продукция (Артикул)
 * 9. продукция (кол-во)
 * 10. продукция (цена)
 * 11. курс
 * 12. Статус
 * 13. Номер РН
 * 14. Дата РН
 * 15. Номер Счета
 * 16. Дата Счета
 *
 * CRM заполняет колонки 1–12; 13–16 заполняет 1С. Когда 1С записывает 13–16,
 * триггер по расписанию отправляет эти данные в CRM (POST order-documents).
 *
 * Настройка отправки в CRM:
 * 1. Заполните CRM_BASE_URL и CRM_WEBHOOK_SECRET_IN ниже.
 * 2. Триггеры → Добавить → функция pushDocumentUpdatesToCrm → По времени → каждую минуту (или 5 мин).
 */

/**
 * Настройки для отправки документов из таблицы в CRM.
 * Заполните и сохраните скрипт, затем создайте триггер: Триггеры → Добавить → pushDocumentUpdatesToCrm,
 * «По времени» → «Минуты» → каждую минуту (или каждые 5 минут).
 */
var CRM_BASE_URL = "";           // Базовый URL CRM, например https://your-crm.com (без слэша в конце)
var CRM_WEBHOOK_SECRET_IN = ""; // Тот же секрет, что в настройках CRM «Секрет для вхідного push»

var SHEET_MAIN_INDEX = 0;
var COL_DEAL_ID = 1;            // колонка 2 (0-based: 1)
var COL_WAYBILL_NUMBER = 12;    // колонка 13
var COL_WAYBILL_DATE = 13;
var COL_INVOICE_NUMBER = 14;
var COL_INVOICE_DATE = 15;

var SENT_SHEET_NAME = "CRM_Sent";

/**
 * Защита: в Apps Script нет доступа к заголовкам запроса (X-Webhook-Secret не приходит).
 * CRM по-прежнему может отправлять секрет в заголовке; главная защита — неизвестный URL развёртывания.
 */

function doPost(e) {
  try {
    if (!e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "Expected JSON body" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var body = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];

    var dateStr = body.date || "";
    var dealId = body.dealId || "";
    var responsible = body.responsibleFullName || "";
    var counterpartyCode1C = body.counterpartyCode1C != null ? String(body.counterpartyCode1C) : "";
    var paymentMethod = body.paymentMethod != null ? String(body.paymentMethod) : "";
    var fopCode = body.fopCode != null ? String(body.fopCode) : "";
    var warehouseCode = body.warehouseCode != null ? String(body.warehouseCode) : "";
    var exchangeRate = body.exchangeRate != null ? String(body.exchangeRate) : "";
    var status = body.status != null ? String(body.status) : "";

    var items = body.items;
    if (!items || !Array.isArray(items) || items.length === 0) {
      items = [{ sku: "", qty: 0, price: 0 }];
    }

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var sku = item.sku != null ? String(item.sku) : "";
      var qty = item.qty != null ? Number(item.qty) : 0;
      var price = item.price != null ? Number(item.price) : 0;

      var row = [
        dateStr,
        dealId,
        responsible,
        counterpartyCode1C,
        paymentMethod,
        fopCode,
        warehouseCode,
        sku,
        qty,
        price,
        exchangeRate,
        status,
        "",
        "",
        "",
        ""
      ];
      sheet.appendRow(row);
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * doGet: для 1С — список строк со статусом «Новый» (колонка 12) или обновление статуса по deal_id.
 * ?action=update&deal_id=... — установить колонку 12 в «Загружен» для строк с данным ID сделки.
 * Без action — вернуть JSON массив строк, у которых колонка 12 = «Новый».
 */
function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  var params = e.parameter || {};
  var data = sheet.getDataRange().getValues();
  var headerRow = data.length > 0 ? data[0] : [];
  var dataStart = 1;

  if (params.action === "update" && params.deal_id) {
    var dealId = params.deal_id;
    for (var j = dataStart; j < data.length; j++) {
      if (data[j][1] == dealId && data[j][11] === "READY_TO_SHIP") {
        sheet.getRange(j + 1, 12).setValue("Загружен");
      }
    }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, message: "Status updated for " + dealId }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var result = [];
  for (var i = dataStart; i < data.length; i++) {
    if (data[i][11] === "READY_TO_SHIP" || data[i][11] === "Новый") {
      result.push({
        Date: data[i][0],
        DealID: data[i][1],
        Manager: data[i][2],
        Code1C: data[i][3],
        Payment: data[i][4],
        FOP: data[i][5],
        Warehouse: data[i][6],
        SKU: data[i][7],
        Quantity: data[i][8],
        Price: data[i][9],
        ExchangeRate: data[i][10],
        Status: data[i][11],
        WaybillNumber: data[i][12],
        WaybillDate: data[i][13],
        InvoiceNumber: data[i][14],
        InvoiceDate: data[i][15]
      });
    }
  }
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Получить лист CRM_Sent (учёт уже отправленных в CRM orderId). Создаёт лист, если нет.
 */
function getSentSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SENT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SENT_SHEET_NAME);
    sheet.getRange(1, 1).setValue("orderId");
  }
  return sheet;
}

function getSentOrderIds() {
  var sheet = getSentSheet();
  var data = sheet.getDataRange().getValues();
  var ids = {};
  for (var i = 1; i < data.length; i++) {
    var id = data[i][0];
    if (id) ids[id] = true;
  }
  return ids;
}

function markOrderIdSent(orderId) {
  getSentSheet().appendRow([orderId]);
}

/**
 * Форматировать значение ячейки (дата или строка) для отправки в CRM.
 */
function formatCellForApi(val) {
  if (val === null || val === undefined) return undefined;
  if (typeof val === "object" && val.getTime) {
    var d = new Date(val);
    return Utilities.formatDate(d, Session.getScriptTimeZone() || "Europe/Kiev", "yyyy-MM-dd");
  }
  var s = String(val).trim();
  return s || undefined;
}

/**
 * Найти заказы, у которых заполнены номера/даты документов (колонки 13–16), и отправить их в CRM.
 * Вызывается триггером по расписанию (раз в 1–5 минут).
 */
function pushDocumentUpdatesToCrm() {
  if (!CRM_BASE_URL || !CRM_BASE_URL.trim()) return;
  var baseUrl = CRM_BASE_URL.replace(/\/+$/, "");
  var url = baseUrl + "/integrations/google-sheet/order-documents";

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheets()[SHEET_MAIN_INDEX];
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  var sent = getSentOrderIds();
  var dealIdsToSend = {};
  var dataByDealId = {};

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var dealId = row[COL_DEAL_ID];
    if (!dealId || sent[dealId]) continue;

    var waybillNumber = formatCellForApi(row[COL_WAYBILL_NUMBER]);
    var waybillDate = formatCellForApi(row[COL_WAYBILL_DATE]);
    var invoiceNumber = formatCellForApi(row[COL_INVOICE_NUMBER]);
    var invoiceDate = formatCellForApi(row[COL_INVOICE_DATE]);

    if (!waybillNumber && !waybillDate && !invoiceNumber && !invoiceDate) continue;

    if (!dataByDealId[dealId]) {
      dataByDealId[dealId] = {
        orderId: dealId,
        waybillNumber: waybillNumber,
        waybillDate: waybillDate,
        invoiceNumber: invoiceNumber,
        invoiceDate: invoiceDate
      };
    }
  }

  for (var orderId in dataByDealId) {
    var payload = dataByDealId[orderId];
    var options = {
      method: "post",
      contentType: "application/json",
      muteHttpExceptions: true,
      payload: JSON.stringify(payload)
    };
    if (CRM_WEBHOOK_SECRET_IN) {
      options.headers = { "X-Webhook-Secret": CRM_WEBHOOK_SECRET_IN };
    }
    try {
      var resp = UrlFetchApp.fetch(url, options);
      if (resp.getResponseCode() >= 200 && resp.getResponseCode() < 300) {
        markOrderIdSent(orderId);
      }
    } catch (err) {
      Logger.log("pushDocumentUpdatesToCrm error for " + orderId + ": " + err.toString());
    }
  }
}
