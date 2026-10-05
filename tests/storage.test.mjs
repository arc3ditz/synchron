import assert from "node:assert/strict";
import test from "node:test";
import { loadStorageData } from "../src/utils/storage.ts";

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

function withStorage(values, callback) {
  const storage = new MemoryStorage();
  for (const [key, value] of Object.entries(values)) storage.setItem(key, value);
  globalThis.localStorage = storage;
  try {
    callback(storage);
  } finally {
    delete globalThis.localStorage;
  }
}

test("missing key returns fallback", () => {
  withStorage({}, () => {
    assert.deepEqual(loadStorageData("goals", []), []);
  });
});

test("valid JSON returns parsed data", () => {
  withStorage({ goals: JSON.stringify([{ id: "g1" }]) }, () => {
    assert.deepEqual(loadStorageData("goals", []), [{ id: "g1" }]);
  });
});

test("corrupted JSON preserves original value and does not overwrite it with fallback", () => {
  withStorage({ goals: "{not valid json" }, (storage) => {
    const result = loadStorageData("goals", []);
    assert.deepEqual(result, []);
    // Original raw value is preserved under a backup key; the corrupted entry
    // is moved aside so a later save of the fallback cannot destroy it.
    assert.equal(storage.getItem("goalsCorruptedBackup"), "{not valid json");
    assert.equal(storage.getItem("goals"), null);
    // A later save of fallback writes to the main key; backup is untouched.
    storage.setItem("goals", JSON.stringify([]));
    assert.equal(storage.getItem("goalsCorruptedBackup"), "{not valid json");
  });
});
