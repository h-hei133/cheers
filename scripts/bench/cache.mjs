import { spawnSync } from "node:child_process";

export const WARM_CACHE_CONTROL = "warm-uncontrolled";
export const GLOBAL_COLD_CACHE_CONTROL = "global-cold";

const controls = new Set([WARM_CACHE_CONTROL, GLOBAL_COLD_CACHE_CONTROL]);

export function resolveCacheControl(value = process.env.BENCH_CACHE_CONTROL, platform = process.platform) {
  const control = value?.trim() || WARM_CACHE_CONTROL;
  if (!controls.has(control)) {
    throw new Error(`BENCH_CACHE_CONTROL must be one of: ${[...controls].join(", ")}`);
  }
  if (control === GLOBAL_COLD_CACHE_CONTROL && platform !== "linux") {
    throw new Error("BENCH_CACHE_CONTROL=global-cold requires Linux");
  }
  return control;
}

function commandFailure(label, result) {
  if (result.error) return `${label} failed: ${result.error.message}`;
  return `${label} exited ${result.status ?? "unknown"}`;
}

export function createCacheController({
  value = process.env.BENCH_CACHE_CONTROL,
  platform = process.platform,
  run = spawnSync,
} = {}) {
  const control = resolveCacheControl(value, platform);
  return {
    control,
    prepare() {
      if (control === WARM_CACHE_CONTROL) return { control, dropped: false };

      const synced = run("sync", [], { encoding: "utf8" });
      if (synced.error || synced.status !== 0) throw new Error(commandFailure("sync", synced));

      const dropped = run("sudo", ["-n", "tee", "/proc/sys/vm/drop_caches"], {
        encoding: "utf8",
        input: "3\n",
        stdio: ["pipe", "ignore", "pipe"],
      });
      if (dropped.error || dropped.status !== 0) {
        throw new Error(commandFailure("drop_caches", dropped));
      }
      return { control, dropped: true };
    },
  };
}

export function cacheEvidence(control, preparations, expectedSamples) {
  if (preparations.length !== expectedSamples) {
    throw new Error(`cache preparation count ${preparations.length} does not match ${expectedSamples} samples`);
  }
  if (preparations.some(preparation => preparation.control !== control)) {
    throw new Error("cache preparation control does not match the benchmark control");
  }
  const droppedSamples = preparations.filter(preparation => preparation.dropped).length;
  if (control === GLOBAL_COLD_CACHE_CONTROL && droppedSamples !== expectedSamples) {
    throw new Error(`global cold cache was not dropped before all ${expectedSamples} samples`);
  }
  if (control === WARM_CACHE_CONTROL && droppedSamples !== 0) {
    throw new Error("warm cache control unexpectedly dropped caches");
  }
  return {
    control,
    expectedSamples,
    preparedSamples: preparations.length,
    droppedSamples,
    syncCommand: control === GLOBAL_COLD_CACHE_CONTROL ? "sync" : null,
    dropCommand: control === GLOBAL_COLD_CACHE_CONTROL ? "sudo -n tee /proc/sys/vm/drop_caches" : null,
  };
}
