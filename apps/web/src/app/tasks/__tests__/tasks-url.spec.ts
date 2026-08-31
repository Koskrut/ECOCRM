import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_TASKS_URL,
  buildTasksSearchParams,
  parseTasksUrl,
  type TasksUrlState,
} from "../tasks-url";

function fromQuery(query: string) {
  return parseTasksUrl(new URLSearchParams(query));
}

test("parseTasksUrl defaults to mine/active/priority", () => {
  const parsed = fromQuery("");
  assert.equal(parsed.view, "mine");
  assert.equal(parsed.status, "active");
  assert.equal(parsed.sortBy, "priority");
  assert.equal(parsed.sortDir, "asc");
  assert.equal(parsed.page, 1);
  assert.equal(parsed.taskId, "");
});

test("parseTasksUrl maps attention=overdue to overdue view", () => {
  const parsed = fromQuery("attention=overdue");
  assert.equal(parsed.attention, "overdue");
  assert.equal(parsed.view, "overdue");
  assert.equal(parsed.period, "overdue");
});

test("parseTasksUrl reads view, taskId, ids, q, page", () => {
  const parsed = fromQuery("view=today&taskId=t1&ids=a,b&q=hello&page=3");
  assert.equal(parsed.view, "today");
  assert.equal(parsed.taskId, "t1");
  assert.equal(parsed.ids, "a,b");
  assert.equal(parsed.q, "hello");
  assert.equal(parsed.page, 3);
});

test("buildTasksSearchParams omits defaults", () => {
  const params = buildTasksSearchParams({ ...DEFAULT_TASKS_URL });
  assert.equal(params.toString(), "");
});

test("buildTasksSearchParams round-trips filters and taskId", () => {
  const state: TasksUrlState = {
    ...DEFAULT_TASKS_URL,
    view: "delegated",
    status: "IN_PROGRESS",
    assigneeId: "u1",
    q: "call",
    sortBy: "dueAt",
    sortDir: "desc",
    page: 2,
    taskId: "task-9",
    ids: "t1,t2",
  };
  const params = buildTasksSearchParams(state);
  const parsed = parseTasksUrl(params);
  assert.equal(parsed.view, "delegated");
  assert.equal(parsed.status, "IN_PROGRESS");
  assert.equal(parsed.assigneeId, "u1");
  assert.equal(parsed.q, "call");
  assert.equal(parsed.sortBy, "dueAt");
  assert.equal(parsed.sortDir, "desc");
  assert.equal(parsed.page, 2);
  assert.equal(parsed.taskId, "task-9");
  assert.equal(parsed.ids, "t1,t2");
});

test("closing task clears taskId from built URL", () => {
  const withTask = buildTasksSearchParams({ ...DEFAULT_TASKS_URL, taskId: "x" });
  assert.equal(withTask.get("taskId"), "x");
  const closed = buildTasksSearchParams({ ...DEFAULT_TASKS_URL, taskId: "" });
  assert.equal(closed.get("taskId"), null);
});
