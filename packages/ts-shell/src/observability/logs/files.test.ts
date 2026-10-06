import * as fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { orderedLogFiles } from "./files.js";
import { runMetricsCommand } from "../../core/commands/metricsCommandRuntime.js";
import { RotatingFileSink, setGlobalRotatingFileSink } from "../rotatingFileSink.js";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return { ...actual, statSync: vi.fn(actual.statSync) };
});
const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
let root: string | undefined;
afterEach(() => {
  vi.mocked(fs.statSync).mockImplementation(actual.statSync);
  setGlobalRotatingFileSink(null);
  if (root) fs.rmSync(root, { recursive: true, force: true });
});

it("retains healthy metric shards while mutation enumeration refuses unreadable inputs", async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "log-enumeration-"));
  const sink = new RotatingFileSink({ logDir: root });
  setGlobalRotatingFileSink(sink);
  const healthy = sink.getCurrentFilePath();
  const broken = `${healthy}.1`;
  fs.writeFileSync(healthy, JSON.stringify({ component: "metric", message: "healthy-count", fields: { metric: 'count', count: 1, total: 1, max: 1 } }) + "\n");
  fs.writeFileSync(broken, "inaccessible");
  vi.mocked(fs.statSync).mockImplementation(((file: fs.PathLike, ...args: unknown[]) => {
    if (file === broken) throw Object.assign(new Error("unreadable shard"), { code: "EACCES" });
    return Reflect.apply(actual.statSync, fs, [file, ...args]);
  }) as typeof fs.statSync);
  expect(orderedLogFiles(root, healthy)).toEqual([healthy]);
  const result = await runMetricsCommand([], { cwd: root });
  expect(result.output).toContain("healthy-count");
  expect(result.report?.facts).toMatchObject({ status: 'partial', unreadableFiles: 1 });
  expect(() => sink.clear()).toThrow("unreadable shard");
  expect(() => sink.exportTo(path.join(root!, "export.jsonl"))).toThrow("unreadable shard");
  expect(fs.readFileSync(broken, "utf8")).toBe("inaccessible");
});
