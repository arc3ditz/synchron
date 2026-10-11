import assert from "node:assert/strict";
import test from "node:test";
import {
  FREQUENCY_LABELS,
  PROJECT_STATUS_LABELS,
  TASK_PRIORITY_LABELS,
} from "../src/utils/displayLabels.ts";

test("stored task priorities and project statuses have title-cased display labels", () => {
  assert.deepEqual(TASK_PRIORITY_LABELS, {
    high: "High",
    medium: "Medium",
    low: "Low",
  });
  assert.deepEqual(PROJECT_STATUS_LABELS, {
    active: "Active",
    completed: "Completed",
    archived: "Archived",
  });
});

test("stored frequency values share one title-cased display mapping", () => {
  assert.deepEqual(FREQUENCY_LABELS, {
    daily: "Everyday",
    weekdays: "Weekdays",
    weekends: "Weekends",
    custom: "Custom Days",
  });
});
