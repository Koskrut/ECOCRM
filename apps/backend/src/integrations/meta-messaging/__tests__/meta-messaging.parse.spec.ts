import test from "node:test";
import assert from "node:assert/strict";
import { ConversationChannel } from "@prisma/client";
import { parseMetaInboundMessages, resolveMetaChannelFromObject } from "../meta-messaging.parse";

test("resolveMetaChannelFromObject maps instagram and page", () => {
  assert.equal(resolveMetaChannelFromObject("instagram"), ConversationChannel.INSTAGRAM);
  assert.equal(resolveMetaChannelFromObject("page"), ConversationChannel.FACEBOOK);
  assert.equal(resolveMetaChannelFromObject("unknown"), null);
});

test("parseMetaInboundMessages extracts text messages and skips echo", () => {
  const body = {
    object: "instagram",
    entry: [
      {
        id: "PAGE_1",
        messaging: [
          {
            sender: { id: "USER_1" },
            recipient: { id: "PAGE_1" },
            timestamp: 1_700_000_000_000,
            message: { mid: "m1", text: "Привіт", is_echo: false },
          },
          {
            sender: { id: "PAGE_1" },
            recipient: { id: "USER_1" },
            timestamp: 1_700_000_001_000,
            message: { mid: "m2", text: "відповідь", is_echo: true },
          },
        ],
      },
    ],
  };

  const parsed = parseMetaInboundMessages(body);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.channel, ConversationChannel.INSTAGRAM);
  assert.equal(parsed[0]?.participantId, "USER_1");
  assert.equal(parsed[0]?.messageId, "m1");
  assert.equal(parsed[0]?.text, "Привіт");
});

test("parseMetaInboundMessages handles facebook page object and media placeholder", () => {
  const body = {
    object: "page",
    entry: [
      {
        id: "PAGE_FB",
        messaging: [
          {
            sender: { id: "PSID_9" },
            recipient: { id: "PAGE_FB" },
            timestamp: 1_700_000_002_000,
            message: {
              mid: "m3",
              attachments: [{ type: "image" }],
            },
          },
        ],
      },
    ],
  };

  const parsed = parseMetaInboundMessages(body);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.channel, ConversationChannel.FACEBOOK);
  assert.equal(parsed[0]?.text, "[image]");
});
