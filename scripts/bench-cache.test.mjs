import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cacheEvidence,
  createCacheController,
  GLOBAL_COLD_CACHE_CONTROL,
  resolveCacheControl,
  WARM_CACHE_CONTROL,
} from "./bench/cache.mjs";

test("defaults to warm cache and rejects unknown controls", () => {
  assert.equal(resolveCacheControl(undefined, "linux"), WARM_CACHE_CONTROL);
  assert.throws(() => resolveCacheControl("best-effort-cold", "linux"), /must be one of/);
});

test("allows global cold control only on Linux", () => {
  assert.equal(resolveCacheControl(GLOBAL_COLD_CACHE_CONTROL, "linux"), GLOBAL_COLD_CACHE_CONTROL);
  assert.throws(() => resolveCacheControl(GLOBAL_COLD_CACHE_CONTROL, "darwin"), /requires Linux/);
});

test("warm control prepares without running commands", () => {
  const calls = [];
  const cache = createCacheController({
    value: WARM_CACHE_CONTROL,
    platform: "linux",
    run: (...args) => {
      calls.push(args);
      return { status: 0 };
    },
  });
  assert.deepEqual(cache.prepare(), { control: WARM_CACHE_CONTROL, dropped: false });
  assert.deepEqual(calls, []);
});

test("global cold control syncs then drops caches without a password prompt", () => {
  const calls = [];
  const cache = createCacheController({
    value: GLOBAL_COLD_CACHE_CONTROL,
    platform: "linux",
    run: (command, args, options) => {
      calls.push({ command, args, options });
      return { status: 0 };
    },
  });
  assert.deepEqual(cache.prepare(), { control: GLOBAL_COLD_CACHE_CONTROL, dropped: true });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], { command: "sync", args: [], options: { encoding: "utf8" } });
  assert.equal(calls[1].command, "sudo");
  assert.deepEqual(calls[1].args, ["-n", "tee", "/proc/sys/vm/drop_caches"]);
  assert.equal(calls[1].options.input, "3\n");
});

test("global cold control fails closed on command errors", () => {
  assert.throws(() => createCacheController({
    value: GLOBAL_COLD_CACHE_CONTROL,
    platform: "linux",
    run: () => ({ status: 1 }),
  }).prepare(), /sync exited 1/);
  assert.throws(() => createCacheController({
    value: GLOBAL_COLD_CACHE_CONTROL,
    platform: "linux",
    run: command => command === "sync" ? { status: 0 } : { status: 1 },
  }).prepare(), /drop_caches exited 1/);
});

test("cache evidence rejects missing or mislabeled preparations", () => {
  assert.throws(() => cacheEvidence(WARM_CACHE_CONTROL, [], 1), /does not match/);
  assert.throws(() => cacheEvidence(WARM_CACHE_CONTROL,
    [{ control: GLOBAL_COLD_CACHE_CONTROL, dropped: false }], 1), /does not match the benchmark control/);
  assert.throws(() => cacheEvidence(GLOBAL_COLD_CACHE_CONTROL,
    [{ control: GLOBAL_COLD_CACHE_CONTROL, dropped: false }], 1), /not dropped/);
  assert.deepEqual(cacheEvidence(GLOBAL_COLD_CACHE_CONTROL,
    [{ control: GLOBAL_COLD_CACHE_CONTROL, dropped: true }], 1), {
    control: GLOBAL_COLD_CACHE_CONTROL,
    expectedSamples: 1,
    preparedSamples: 1,
    droppedSamples: 1,
    syncCommand: "sync",
    dropCommand: "sudo -n tee /proc/sys/vm/drop_caches",
  });
});
