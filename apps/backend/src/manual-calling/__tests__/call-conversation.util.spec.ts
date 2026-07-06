import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CallQueueItemStatus } from "@prisma/client";
import { isConversation } from "../call-conversation.util";

describe("isConversation", () => {
  it("returns true for ANSWERED with positive talkSec", () => {
    assert.equal(isConversation("ANSWERED", 30, 0), true);
  });

  it("returns true for ANSWERED with durationSec fallback when talkSec is null", () => {
    assert.equal(isConversation("ANSWERED", null, 15), true);
  });

  it("returns false for ANSWERED with zero talk time", () => {
    assert.equal(isConversation("ANSWERED", 0, 0), false);
  });

  it("returns false for MISSED even with duration", () => {
    assert.equal(isConversation("MISSED", 30, 30), false);
  });
});
