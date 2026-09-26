import test from "node:test";
import assert from "node:assert/strict";
import { loadTypescript } from "./helpers/d1.mjs";

const { isTaskActive, isTaskCompleted, isTaskPaused } = await loadTypescript(
  "src/client/lib/useTasksContext.tsx",
);

function task(overrides = {}) {
  return {
    scope: "live_and_backfill",
    live_enabled: false,
    backfill_status: "complete",
    stop_reason: null,
    ...overrides,
  };
}

test("completed or cancelled history-only tasks belong in History", () => {
  for (const backfill_status of ["complete", "cancelled"]) {
    const history = task({ scope: "backfill_only", backfill_status });
    assert.equal(isTaskCompleted(history), true);
    assert.equal(isTaskActive(history), false);
    assert.equal(isTaskPaused(history), false);
  }
});

test("pausing combined copying after history finishes keeps the task in Paused for resuming", () => {
  for (const backfill_status of ["complete", "cancelled"]) {
    const combined = task({ backfill_status });
    assert.equal(isTaskCompleted(combined), false);
    assert.equal(isTaskActive(combined), false);
    assert.equal(isTaskPaused(combined), true);
    const resumed = { ...combined, live_enabled: true };
    assert.equal(isTaskActive(resumed), true);
    assert.equal(isTaskPaused(resumed), false);
    assert.equal(isTaskCompleted(resumed), false);
  }
});

test("a paused new-message task remains Paused even if historical state was retained", () => {
  for (const backfill_status of ["not_applicable", "complete", "cancelled"]) {
    const live = task({ scope: "live", backfill_status });
    assert.equal(isTaskCompleted(live), false);
    assert.equal(isTaskActive(live), false);
    assert.equal(isTaskPaused(live), true);
  }
});

test("a stop reason or failed history keeps tasks in the attention view", () => {
  for (const interrupted of [
    task({ live_enabled: true, stop_reason: "insufficient_permissions" }),
    task({ scope: "backfill_only", stop_reason: "unauthorized" }),
    task({ backfill_status: "failed" }),
  ]) {
    assert.equal(isTaskCompleted(interrupted), false);
    assert.equal(isTaskActive(interrupted), false);
    assert.equal(isTaskPaused(interrupted), true);
  }
});
