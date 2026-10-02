import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RotatingFileSink } from "../rotatingFileSink.js";
import type { StructuredLogEntry } from "../types.js";

let root: string;
const prefix = "retention";
const today = new Date().toISOString().slice(0, 10);
const entry: StructuredLogEntry = {
  timestamp: new Date().toISOString(), level: "info", traceId: "trace", spanId: "span",
  component: "retention", message: "a log record", fields: {},
};

beforeEach(() => { root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-log-retention-")); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

describe("log retention", () => {
  it.each([0, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects an invalid file limit (%s)", (maxFiles) => {
    expect(() => new RotatingFileSink({ logDir: root, maxFiles })).toThrow("maxFiles must be a positive safe integer");
  });

  it("prunes expired files before keeping the newest shards within the count limit", () => {
    const old = `${prefix}.2000-01-01.999999999.log`;
    fs.writeFileSync(path.join(root, old), "expired");
    const shards = Array.from({ length: 8 }, (_, index) => `${prefix}.${today}.999999999.log.${index + 1}`);
    shards.forEach((name, index) => {
      const file = path.join(root, name);
      fs.writeFileSync(file, String(index));
      fs.utimesSync(file, index + 1, index + 1);
    });
    const sink = new RotatingFileSink({ logDir: root, filePrefix: prefix, maxFiles: 3 });
    sink.write(entry);
    expect(fs.readdirSync(root).sort()).toEqual([path.basename(sink.getCurrentFilePath()), ...shards.slice(-2)].sort());
  });

  it.each([1, 3])("bounds continuous rotations from the current process to %s files", (maxFiles) => {
    const sink = new RotatingFileSink({ logDir: root, filePrefix: prefix, maxFiles, maxFileSizeMb: 0.0001 });
    for (let index = 0; index < 12; index++) sink.write({ ...entry, message: `record-${index}` });
    expect(fs.readdirSync(root)).toHaveLength(maxFiles);
    expect(fs.readFileSync(sink.getCurrentFilePath(), "utf8")).toContain("record-11");
  });

  it("preserves foreign live process logs and files outside its log prefixes", () => {
    const live = path.join(root, `${prefix}.2000-01-01.${process.pid}.log`);
    const unrelated = path.join(root, `unrelated.${today}.999999999.log`);
    fs.writeFileSync(live, "live process");
    fs.writeFileSync(unrelated, "different owner");
    const sink = new RotatingFileSink({ logDir: root, filePrefix: prefix, pid: 999999998, maxFiles: 1 });
    sink.write(entry);
    expect(fs.readFileSync(live, "utf8")).toBe("live process");
    expect(fs.readFileSync(unrelated, "utf8")).toBe("different owner");
    expect(fs.existsSync(sink.getCurrentFilePath())).toBe(true);
  });

  it.each([false, true])("keeps chronological tails through pruning and tied timestamps (reopen=%s)", (reopen) => {
    const options = { logDir: root, filePrefix: prefix, maxFiles: 3, maxFileSizeMb: 0.0001 };
    let sink = new RotatingFileSink(options);
    for (let index = 0; index < 18; index++) {
      if (reopen && index === 9) {
        sink.flushAndClose();
        sink = new RotatingFileSink(options);
      }
      sink.write({ ...entry, message: `record-${index}` });
      for (const file of sink.getFiles()) fs.utimesSync(file, 100, 100);
      const count = Math.min(index + 1, options.maxFiles);
      expect(sink.getRecentLines(50).map((line) => JSON.parse(line).message))
        .toEqual(Array.from({ length: count }, (_, offset) => `record-${index - count + 1 + offset}`));
      expect(sink.getFiles()).toHaveLength(count);
    }
  });

  it("does not treat a process inspection permission error as proof of exit", () => {
    const uncertain = path.join(root, `${prefix}.2000-01-01.999999997.log`);
    fs.writeFileSync(uncertain, "owner could still be writing");
    vi.spyOn(process, "kill").mockImplementation(() => { throw Object.assign(new Error("denied"), { code: "EPERM" }); });
    new RotatingFileSink({ logDir: root, filePrefix: prefix, maxFiles: 1 }).write(entry);
    expect(fs.readFileSync(uncertain, "utf8")).toBe("owner could still be writing");
  });
});
