import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { UpdateTaskDto } from "../dto/update-task.dto";

/** Mirrors TasksService.update entity-patch merge for unit coverage. */
function buildEntityUpdateData(
  body: UpdateTaskDto,
  current: { contactId: string | null; companyId: string | null; leadId: string | null; orderId: string | null },
): Partial<{ contactId: string | null; companyId: string | null; leadId: string | null; orderId: string | null }> {
  const patch: Partial<{
    contactId: string | null;
    companyId: string | null;
    leadId: string | null;
    orderId: string | null;
  }> = {};
  if (body.contactId !== undefined) patch.contactId = body.contactId;
  if (body.companyId !== undefined) patch.companyId = body.companyId;
  if (body.leadId !== undefined) patch.leadId = body.leadId;
  if (body.orderId !== undefined) patch.orderId = body.orderId;
  return patch;
}

function nextEntityIds(
  body: UpdateTaskDto,
  current: { contactId: string | null; companyId: string | null; leadId: string | null; orderId: string | null },
) {
  return {
    contactId: body.contactId !== undefined ? body.contactId : current.contactId,
    companyId: body.companyId !== undefined ? body.companyId : current.companyId,
    leadId: body.leadId !== undefined ? body.leadId : current.leadId,
    orderId: body.orderId !== undefined ? body.orderId : current.orderId,
  };
}

describe("task entity link update", () => {
  const current = {
    contactId: "c1",
    companyId: null as string | null,
    leadId: null as string | null,
    orderId: null as string | null,
  };

  it("replaces contact with lead and clears contact when both sent", () => {
    const body: UpdateTaskDto = { contactId: null, leadId: "l1" };
    const data = buildEntityUpdateData(body, current);
    assert.deepEqual(data, { contactId: null, leadId: "l1" });
    assert.deepEqual(nextEntityIds(body, current), {
      contactId: null,
      companyId: null,
      leadId: "l1",
      orderId: null,
    });
  });

  it("clears all links when nulls are sent", () => {
    const body: UpdateTaskDto = {
      contactId: null,
      companyId: null,
      leadId: null,
      orderId: null,
    };
    assert.deepEqual(nextEntityIds(body, current), {
      contactId: null,
      companyId: null,
      leadId: null,
      orderId: null,
    });
  });

  it("leaves untouched fields when patch omits them", () => {
    const body: UpdateTaskDto = { title: "x" };
    assert.deepEqual(buildEntityUpdateData(body, current), {});
    assert.deepEqual(nextEntityIds(body, current), current);
  });
});
