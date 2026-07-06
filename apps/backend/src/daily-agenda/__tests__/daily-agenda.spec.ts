import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultProposal,
  buildSmartDefaultProposal,
  mergeRecommitItems,
} from "../daily-agenda.proposal";
import {
  buildSuggestions,
  groupSuggestions,
  pickSeedSuggestions,
} from "../daily-agenda.suggestions";
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
          contactName: null,
          companyName: null,
          leadName: null,
          daysOverdue: null,
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
          companyName: "ACME",
          clientStage: "ACTIVE_CLIENT",
        },
      ],
      dateYmd: "2026-06-24",
    });
    assert.equal(proposal.length, 3);
    assert.equal(proposal[0].kind, "VISIT");
    assert.equal(proposal[1].kind, "TASK");
    assert.equal(proposal[2].kind, "CONTACT_ACTION");
    assert.ok(proposal[2].title.includes("Petro"));
    assert.ok(proposal[2].metadata?.entityHref?.includes("c2"));
  });

  it("smart proposal seeds from suggestions when scheduled empty", () => {
    const suggestions = buildSuggestions({
      profile: "office",
      visits: [],
      tasks: [],
      contactActions: [],
      backlogVisits: [],
      overdueTasks: [
        {
          id: "t1",
          title: "Передзвонить",
          dueAt: "2026-06-20T12:00:00.000Z",
          status: "OPEN",
          contactId: "c1",
          leadId: null,
          contactName: "Ivan",
          companyName: "Clinic",
          leadName: null,
          daysOverdue: 4,
        },
      ],
      queueContacts: [],
      hotLeads: [],
      newLeads: [],
      overdueOrders: [],
      callQueueItems: [],
      debtContacts: [],
      missedCalls: [],
      planKeys: new Set(),
    });
    const seeds = pickSeedSuggestions({ profile: "office", suggestions });
    const proposal = buildSmartDefaultProposal({ scheduled: [], seedSuggestions: seeds });
    assert.ok(proposal.length > 0);
    assert.equal(proposal[0].kind, "TASK");
    assert.ok(proposal[0].subtitle?.includes("Clinic"));
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
          companyName: null,
          clientStage: null,
        },
      ],
      backlogVisits: [],
      overdueTasks: [],
      queueContacts: [],
      hotLeads: [],
      newLeads: [],
      overdueOrders: [],
      callQueueItems: [],
      debtContacts: [],
      missedCalls: [],
      planKeys: new Set(),
    });
    assert.ok(suggestions.some((s) => s.suggestionKey.startsWith("meeting-no-visit:")));
  });

  it("groups suggestions by category", () => {
    const suggestions = buildSuggestions({
      profile: "office",
      visits: [],
      tasks: [],
      contactActions: [],
      backlogVisits: [],
      overdueTasks: [
        {
          id: "t1",
          title: "Task",
          dueAt: null,
          status: "OPEN",
          contactId: null,
          leadId: null,
          contactName: null,
          companyName: null,
          leadName: null,
          daysOverdue: 2,
        },
      ],
      queueContacts: [],
      hotLeads: [
        {
          id: "l1",
          name: "Lead One",
          source: "web",
          daysSinceActivity: 5,
          status: "IN_PROGRESS",
          companyName: null,
        },
      ],
      newLeads: [],
      overdueOrders: [
        {
          id: "o1",
          orderNumber: "ORD-1",
          debtAmount: 1000,
          currency: "UAH",
          contactName: "Client",
          companyName: null,
          daysOverdue: 3,
        },
      ],
      callQueueItems: [],
      debtContacts: [],
      missedCalls: [],
      planKeys: new Set(),
    });
    const grouped = groupSuggestions(suggestions);
    assert.ok((grouped.overdue?.length ?? 0) >= 1);
    assert.ok((grouped.leads?.length ?? 0) >= 1);
    assert.ok((grouped.orders?.length ?? 0) >= 1);
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
      paidOrderIds: new Set(),
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

  it("order payment auto-closes suggestion", () => {
    const facts = {
      doneVisitIds: new Set(),
      doneTaskIds: new Set(),
      calledContactIds: new Set(),
      doneVisitContactIds: new Set(),
      contactNextActionChanged: new Set(),
      processedLeadIds: new Set(),
      paidOrderIds: new Set(["o1"]),
    };
    assert.equal(
      shouldAutoCompleteItem(
        {
          kind: "SUGGESTION",
          status: "PLANNED",
          visitId: null,
          taskId: null,
          contactId: null,
          leadId: null,
          metadata: { orderId: "o1" },
        },
        facts,
      ),
      true,
    );
  });
});
