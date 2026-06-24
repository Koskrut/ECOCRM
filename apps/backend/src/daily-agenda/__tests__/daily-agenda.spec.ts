import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildDefaultProposal, mergeRecommitItems } from "../daily-agenda.proposal";
import { buildSuggestions } from "../daily-agenda.suggestions";
import { computeCompletion, shouldAutoCompleteItem } from "../daily-agenda.completion";

describe("daily-agenda.proposal", () => {
  it("buildDefaultProposal includes scheduled not suggestions", () => {
    const proposal = buildDefaultProposal({
      visits: [
        {
          id: "v1",
          title: "Visit A",
          status: "SCHEDULED",
          startsAt: "2026-06-24T09:00:00.000Z",
          endsAt: null,
          contactId: "c1",
          companyName: null,
          contactName: "Ivan",
          purpose: null,
        },
      ],
      tasks: [
        {
          id: "t1",
          title: "Call client",
          dueAt: "2026-06-24T12:00:00.000Z",
          status: "OPEN",
          contactId: null,
          leadId: null,
        },
      ],
      contactActions: [
        {
          contactId: "c2",
          fullName: "Petro",
          nextActionType: "MEETING",
          nextActionAt: "2026-06-24T14:00:00.000Z",
          nextActionNote: null,
          phone: "+380",
        },
      ],
    });
    assert.equal(proposal.length, 3);
    assert.equal(proposal[0].kind, "VISIT");
    assert.equal(proposal[1].kind, "TASK");
    assert.equal(proposal[2].kind, "CONTACT_ACTION");
  });

  it("re-commit preserves DONE and adds new PLANNED", () => {
    const done = [
      {
        kind: "TASK" as const,
        position: 0,
        taskId: "t-done",
        title: "Done task",
        status: "DONE" as const,
      },
    ];
    const incoming = [
      {
        kind: "VISIT" as const,
        position: 0,
        visitId: "v-new",
        title: "New visit",
        status: "PLANNED" as const,
      },
    ];
    const merged = mergeRecommitItems(done, incoming);
    assert.equal(merged.length, 2);
    assert.equal(merged[0].status, "DONE");
    assert.equal(merged[1].visitId, "v-new");
  });
});

describe("daily-agenda.suggestions", () => {
  it("MEETING without visit becomes suggestion", () => {
    const suggestions = buildSuggestions({
      profile: "field",
      visits: [],
      tasks: [],
      contactActions: [
        {
          contactId: "c1",
          fullName: "Ivan",
          nextActionType: "MEETING",
          nextActionAt: "2026-06-24T10:00:00.000Z",
          nextActionNote: null,
          phone: null,
        },
      ],
      backlogVisits: [],
      overdueTasks: [],
      queueContacts: [],
      planKeys: new Set(),
    });
    assert.ok(suggestions.some((s) => s.suggestionKey.startsWith("meeting-no-visit:")));
  });
});

describe("daily-agenda.completion", () => {
  it("completionPercent 2/4 = 50% yellow", () => {
    const c = computeCompletion([
      { status: "DONE" },
      { status: "DONE" },
      { status: "PLANNED" },
      { status: "PLANNED" },
    ]);
    assert.equal(c.percent, 50);
    assert.equal(c.status, "yellow");
    assert.equal(c.activeCount, 4);
    assert.equal(c.doneCount, 2);
  });

  it("visit DONE auto-closes", () => {
    const facts = {
      doneVisitIds: new Set(["v1"]),
      doneTaskIds: new Set(),
      calledContactIds: new Set(),
      doneVisitContactIds: new Set(),
      contactNextActionChanged: new Set(),
      processedLeadIds: new Set(),
    };
    assert.equal(
      shouldAutoCompleteItem(
        {
          kind: "VISIT",
          status: "PLANNED",
          visitId: "v1",
          taskId: null,
          contactId: null,
          leadId: null,
          metadata: {},
        },
        facts,
      ),
      true,
    );
  });
});
