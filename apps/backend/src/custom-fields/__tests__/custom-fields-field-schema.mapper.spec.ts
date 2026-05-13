import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CustomFieldEntityType, CustomFieldType } from "@prisma/client";

import { mapDefinitionToFieldSchema } from "../custom-fields-ui-schema";

describe("mapDefinitionToFieldSchema", () => {
  it("strips sensitive relations to a public schema shape", () => {
    const row = {
      id: "def_1",
      entityType: CustomFieldEntityType.CONTACT,
      key: "client.segment",
      label: "Segment",
      description: "Public hint",
      type: CustomFieldType.SELECT,
      required: true,
      isActive: true,
      system: true,
      dictionaryId: null,
      settings: { secret: "x" },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      dictionary: null,
      options: [
        {
          id: "opt_1",
          definitionId: "def_1",
          key: "a",
          label: "Alpha",
          value: "A",
          sortOrder: 1,
          isActive: true,
          metadata: { x: 1 },
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ],
    };
    const out = mapDefinitionToFieldSchema(row);
    assert.equal(out.id, "def_1");
    assert.equal(out.key, "client.segment");
    assert.equal(out.label, "Segment");
    assert.equal(out.description, "Public hint");
    assert.equal(out.type, "SELECT");
    assert.equal(out.required, true);
    assert.equal(out.dictionary, null);
    assert.equal(out.options.length, 1);
    assert.deepEqual(out.options[0], {
      id: "opt_1",
      key: "a",
      label: "Alpha",
      value: "A",
      sortOrder: 1,
    });
    assert.equal("settings" in out, false);
    assert.equal("system" in out, false);
  });

  it("includes dictionary summary for DICTIONARY_ITEM-style definitions", () => {
    const row = {
      id: "def_2",
      entityType: CustomFieldEntityType.LEAD,
      key: "region",
      label: "Region",
      description: null,
      type: CustomFieldType.DICTIONARY_ITEM,
      required: false,
      isActive: true,
      system: false,
      dictionaryId: "dict_1",
      settings: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      dictionary: { id: "dict_1", key: "regions", name: "Regions" },
      options: [],
    };
    const out = mapDefinitionToFieldSchema(row);
    assert.deepEqual(out.dictionary, { id: "dict_1", key: "regions", name: "Regions" });
  });
});
