import test from "node:test";
import assert from "node:assert/strict";
import {
  contactDenormalizedFromDefault,
  formatEntityAddressLine,
  mapAddressRow,
} from "../../common/entity-address.util";
import {
  mapBitrixPrimaryContactAddress,
  mapBitrixPrimaryCompanyAddress,
} from "../../integrations/bitrix-sync/bitrix-address-sync.util";

test("formatEntityAddressLine combines city and street", () => {
  assert.equal(formatEntityAddressLine("Київ", "вул. Хрещатик, 1"), "Київ, вул. Хрещатик, 1");
  assert.equal(formatEntityAddressLine(null, "вул. Хрещатик, 1"), "вул. Хрещатик, 1");
});

test("contactDenormalizedFromDefault copies default address to cache fields", () => {
  const cache = contactDenormalizedFromDefault({
    city: "Київ",
    addressText: "вул. Test, 10",
    lat: 50.45,
    lng: 30.52,
    googlePlaceId: "place-1",
  });
  assert.equal(cache.city, "Київ");
  assert.equal(cache.addressInfo, "вул. Test, 10");
  assert.equal(cache.lat, 50.45);
  assert.equal(cache.lng, 30.52);
  assert.equal(cache.googlePlaceId, "place-1");
});

test("mapAddressRow exposes displayLine and hasCoordinates", () => {
  const row = mapAddressRow({
    id: "a1",
    label: "Кабінет",
    city: "Львів",
    addressText: "вул. A, 2",
    lat: 49.84,
    lng: 24.03,
    googlePlaceId: null,
    isDefault: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-02"),
  });
  assert.equal(row.displayLine, "Львів, вул. A, 2");
  assert.equal(row.hasCoordinates, true);
});

test("mapBitrixPrimaryContactAddress uses ADDRESS fields not COMMENTS", () => {
  const draft = mapBitrixPrimaryContactAddress({
    ID: 42,
    COMMENTS: "some note",
    ADDRESS: "вул. Main, 1",
    ADDRESS_CITY: "Київ",
    UF_CRM_1753079682882: "Київ",
  });
  assert.ok(draft);
  assert.equal(draft!.addressText, "вул. Main, 1");
  assert.equal(draft!.city, "Київ");
  assert.equal(draft!.legacyId, -42);
});

test("mapBitrixPrimaryCompanyAddress builds from structured fields", () => {
  const draft = mapBitrixPrimaryCompanyAddress({
    ID: 7,
    ADDRESS: "Office 1",
    ADDRESS_CITY: "Одеса",
  });
  assert.ok(draft);
  assert.match(draft!.addressText, /Office 1/);
  assert.equal(draft!.city, "Одеса");
});
