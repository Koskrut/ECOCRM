import test from "node:test";
import assert from "node:assert/strict";
import { BadRequestException } from "@nestjs/common";
import { normalizeDictionaryKey, optionalInteger, optionalNullableString } from "../dto/dictionaries.dto";

test("normalizeDictionaryKey accepts stable lowercase dotted keys", () => {
  assert.equal(normalizeDictionaryKey(" Client.Type "), "client.type");
  assert.equal(normalizeDictionaryKey("order_source"), "order_source");
});

test("normalizeDictionaryKey rejects unsafe keys", () => {
  assert.throws(() => normalizeDictionaryKey("client type"), BadRequestException);
  assert.throws(() => normalizeDictionaryKey("Client-Type"), BadRequestException);
  assert.throws(() => normalizeDictionaryKey("1client"), BadRequestException);
});

test("dictionary DTO helpers normalize nullable strings and integer order", () => {
  assert.equal(optionalNullableString("  "), null);
  assert.equal(optionalNullableString(" value "), "value");
  assert.equal(optionalInteger("12"), 12);
  assert.throws(() => optionalInteger("1.5"), BadRequestException);
});
