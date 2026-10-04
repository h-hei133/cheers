import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { createProjectMemoryLocalStore } from "../projectMemoryLocalStore.js";
import type { ProjectMemoryRecord } from "../projectMemoryStoreContract.js";

it("serializes independent writers, duplicate saves and deletes without losing records", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-concurrency-"));
  const children: ChildProcess[] = [];
  const exits: Promise<void>[] = [];
  const store = createProjectMemoryLocalStore({ ref: { mode: "test-only", root } });
  const record: ProjectMemoryRecord = {
    id: "shared", version: 1, createdAt: "2026-10-04", candidateId: "candidate",
    candidateKind: "project-fact", retentionClass: "project-scoped-candidate",
    approvedAt: "2026-10-04", approvedBySourceCommand: "/memory",
    memoryText: "Checked project fact.", evidence: ["checked"], source: "system-derived",
    routeReferences: [], safety: "safe", redactions: [],
  };
  try {
    for (let index = 0; index < 6; index++) {
      expect((await store.write({ storeRef: store.ref, record: { ...record, id: `old-${index}` } })).written).toBe(true);
    }
    const ready: Promise<void>[] = [];
    const results: Array<{ written: boolean; skipped: boolean }> = [];
    for (let index = 0; index < 6; index++) {
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
        import assert from "node:assert/strict";
        import { createProjectMemoryLocalStore } from ${JSON.stringify(new URL("../projectMemoryLocalStore.ts", import.meta.url).href)};
        const store = createProjectMemoryLocalStore({ ref: ${JSON.stringify(store.ref)} });
        const record = ${JSON.stringify(record)};
        process.once("message", async () => {
          try {
            const shared = await store.write({ storeRef: store.ref, record });
            assert.ok(shared.written || shared.skipped, shared.blocker);
            assert.equal((await store.write({ storeRef: store.ref, record: { ...record, id: "new-${index}" } })).written, true);
            assert.equal((await store.delete({ recordId: "old-${index}", deletedAt: "2026-10-04", sourceCommand: "/memory" })).deleted, true);
            process.send({ written: shared.written, skipped: shared.skipped });
            process.disconnect();
          } catch (error) { console.error(error); process.exit(1); }
        });
        process.send("ready");
      `], { stdio: ["ignore", "ignore", "pipe", "ipc"], timeout: 10_000, killSignal: "SIGKILL" });
      children.push(child);
      let stderr = "";
      child.stderr!.on("data", chunk => { stderr += chunk; });
      const exited = new Promise<void>((resolve, reject) => {
        child.once("error", reject);
        child.once("close", code => code === 0 ? resolve() : reject(new Error(`Writer exited ${code}: ${stderr}`)));
      });
      exits.push(exited);
      ready.push(new Promise<void>((resolve, reject) => {
        child.on("message", message => {
          if (message === "ready") resolve();
          else results.push(message as { written: boolean; skipped: boolean });
        });
        exited.then(() => reject(new Error("Writer exited before ready")), reject);
      }));
    }
    await Promise.all(ready);
    for (const child of children) child.send("start");
    await Promise.all(exits);
    expect(results.filter(result => result.written)).toHaveLength(1);
    expect(results.filter(result => result.skipped)).toHaveLength(5);
    expect((await store.list()).records.map(entry => entry.id).sort()).toEqual([
      "new-0", "new-1", "new-2", "new-3", "new-4", "new-5", "shared",
    ]);
    expect((await store.health()).ok).toBe(true);
    expect(fs.readdirSync(root)).toEqual(["project-memory.jsonl"]);
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill("SIGKILL");
    await Promise.allSettled(exits);
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 15_000);
