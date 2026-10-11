import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { restoreViewMode } from "../src/domain/appPreferences.ts";
import { loadLastView, saveLastView, STORAGE_KEYS } from "../src/utils/storage.ts";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appSource = readFileSync(path.join(root, "src/App.tsx"), "utf8");

class MemoryStorage {
  values = new Map();

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

function withStorage(callback) {
  globalThis.localStorage = new MemoryStorage();
  try {
    callback(globalThis.localStorage);
  } finally {
    delete globalThis.localStorage;
  }
}

test("last view defaults safely and restores a saved supported view", () => {
  withStorage((storage) => {
    assert.equal(loadLastView(), "Today");
    saveLastView("Timer");
    assert.equal(storage.getItem(STORAGE_KEYS.LAST_VIEW), '"Timer"');
    assert.equal(loadLastView(), "Timer");
  });
});

test("invalid stored views fall back to Today", () => {
  withStorage((storage) => {
    storage.setItem(STORAGE_KEYS.LAST_VIEW, JSON.stringify("Removed"));
    assert.equal(loadLastView(), "Today");
  });
});

test("view mode preserves valid saved choices and defaults missing or invalid values to grid", () => {
  assert.equal(restoreViewMode(undefined, "grid"), "grid");
  assert.equal(restoreViewMode("unknown", "grid"), "grid");
  assert.equal(restoreViewMode("grid", "grid"), "grid");
  assert.equal(restoreViewMode("list", "grid"), "list");
  assert.ok(appSource.includes('viewMode: "grid"'));
  assert.ok(appSource.includes("viewMode: restoreViewMode(parsed.viewMode, DEFAULT_SETTINGS.viewMode)"));
});

test("the active view is restored and changes are saved through the shared storage layer", () => {
  assert.ok(appSource.includes("useState<View>(loadLastView)"));
  assert.ok(appSource.includes("saveLastView(view)"));
});
