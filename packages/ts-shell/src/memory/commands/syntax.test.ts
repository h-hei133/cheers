import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseProjectMemoryReviewCommandArgs } from "../projectMemoryReviewCommandContract.js";
import { parseProjectMemorySaveCommandArgs } from "../projectMemorySaveCommandContract.js";
import { parseProjectMemoryRecallCommandArgs } from "../projectMemoryRecallCommandContract.js";
import { parseProjectMemoryDeleteCommandArgs } from "../projectMemoryDeleteCommandContract.js";
import { parseProjectMemoryUseCommandArgs } from "../projectMemoryUseCommandContract.js";
import { createProjectMemoryReviewStateStore } from "../projectMemoryReviewState.js";
import type { ProjectMemoryStore } from "../projectMemoryStoreContract.js";
import { runMemoryCommand } from "../../core/commands/memoryCommandRuntime.js";
import { createCommandRegistry } from "../../core/commands/registry.js";
import { executeMemoryInspect, executeMemoryRecall, executeMemoryRetain } from "../../core/memory/memoryTools.js";

vi.mock("../../core/memory/memoryTools.js", () => ({
  executeMemoryInspect: vi.fn().mockResolvedValue("inspect"),
  executeMemoryRecall: vi.fn().mockResolvedValue("recall"),
  executeMemoryRetain: vi.fn().mockResolvedValue("retain"),
}));

let root: string;
beforeEach(() => { vi.clearAllMocks(); root = fs.mkdtempSync(path.join(os.tmpdir(), "memory-syntax-")); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe("memory command admission", () => {
  it("enforces syntax in direct contract callers as well as the command entrypoint", () => {
    expect(() => parseProjectMemorySaveCommandArgs(["save", "approved", "extra"])).toThrow();
    expect(() => parseProjectMemoryReviewCommandArgs(["--unknown"])).toThrow();
    expect(() => parseProjectMemoryReviewCommandArgs(["list", "extra"])).toThrow();
    expect(() => parseProjectMemoryRecallCommandArgs(["wake", "extra"])).toThrow();
    expect(() => parseProjectMemoryDeleteCommandArgs(["delete", "record", "--unknown"])).toThrow();
    expect(() => parseProjectMemoryUseCommandArgs(["wake"])).toThrow();
  });

  it.each([
    ["inspect", "extra"], ["stats", "--bad"], ["list", "extra"], ["review", "--bad"], ["--unknown"],
    ["save", "approved", "extra"], ["status", "extra"], ["save", "--force"],
    ["approve", "candidate", "--all-safe"], ["approve", "--all-safe", "--all-safe"],
    ["approve", "--unsafe"], ["reject", "--all-safe"], ["approve", "candidate", "--unknown"],
    ["wake", "ignored"], ["wake", "limit:2"], ["delete", "record", "--unknown"],
    ["recall", "query", "limit:1junk"], ["recall", "query", "kind:constructor"],
  ])("rejects %j before reading or changing memory state", async (...args) => {
    const health = vi.fn();
    const review = createProjectMemoryReviewStateStore();
    const update = vi.spyOn(review, "updateCandidates");
    const result = await runMemoryCommand(args, { cwd: root, sessionId: "syntax", projectMemoryReviewStateStore: review,
      projectMemoryStore: { health } as unknown as ProjectMemoryStore });
    expect(result.output).toContain("Outcome: blocked");
    expect(result.output).toContain("Memory written: no");
    expect(health).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(executeMemoryInspect).not.toHaveBeenCalled();
    expect(executeMemoryRetain).not.toHaveBeenCalled();
  });

  it("keeps named invocations as free-text operations rather than lifecycle aliases", async () => {
    await runMemoryCommand(["delete", "record", "--flag"], { cwd: root, rawCommandName: "retain" });
    expect(executeMemoryRetain).toHaveBeenCalledWith({ items: [{ statement: "delete record --flag" }] });
    await runMemoryCommand(["approve", "candidate"], { cwd: root, rawCommandName: "recall" });
    expect(executeMemoryRecall).toHaveBeenCalledWith({ query: "approve candidate" });
    await runMemoryCommand(["add", "--flag-shaped", "prose"], { cwd: root });
    expect(executeMemoryRetain).toHaveBeenLastCalledWith({ items: [{ statement: "--flag-shaped prose", category: "convention" }] });
  });

  it("preserves distinct lifecycle, staging and approval meanings", () => {
    expect(parseProjectMemoryDeleteCommandArgs(["delete", "record"]).mode).toBe("delete");
    expect(parseProjectMemoryDeleteCommandArgs(["invalidate", "record"]).mode).toBe("invalidate");
    expect(parseProjectMemoryUseCommandArgs(["use"])).toMatchObject({ mode: "wake", persistence: "none" });
    expect(parseProjectMemoryUseCommandArgs(["use", "query"])).toMatchObject({ mode: "recall", query: "query" });
    expect(parseProjectMemoryRecallCommandArgs(["SEARCH", "query"])).toMatchObject({ mode: "search", query: "query" });
    expect(parseProjectMemoryReviewCommandArgs(["approve", "--all-safe"])).toMatchObject({ mode: "approve", allSafe: true, persistence: "none" });
    expect(parseProjectMemoryReviewCommandArgs(["reject", "unsafe"])).toMatchObject({ mode: "reject", rejectUnsafe: true });
    expect(parseProjectMemorySaveCommandArgs(["save", "approved"])).toMatchObject({ mode: "save-approved", persistence: "explicit-local" });
  });

  it("uses the runtime action catalog for help and completion without merging non-equivalent actions", () => {
    const command = createCommandRegistry(root).get("memory")!;
    const values = command.getArgumentCompletions!("")!.map(item => item.value);
    for (const name of ["list", "review", "approve", "reject", "recall", "wake", "use", "invalidate", "delete", "save", "status"]) {
      expect(values).toContain(name);
      expect(command.argumentHint).toContain(name);
    }
    expect(command.getArgumentCompletions!("search")?.map(item => item.value)).toContain("search");
    expect(command.getArgumentCompletions!("approve --")?.map(item => item.value)).toEqual(["--all-safe"]);
    expect(command.getArgumentCompletions!("reject --")?.map(item => item.value)).toEqual(["--unsafe"]);
    expect(command.getArgumentCompletions!("approve candidate --")).toBeNull();
  });
});

describe("recall filter validation", () => {
  it.each(["limit:0", "limit:21", "limit:1.5", "limit:1junk", "limit:Infinity", "limit:", "kind:unknown", "source:__proto__", "retention:constructor"])("rejects %s", filter => {
    expect(() => parseProjectMemoryRecallCommandArgs(["recall", "query", filter])).toThrow();
  });
  it("rejects duplicate filters and preserves unrelated query words", () => {
    expect(() => parseProjectMemoryRecallCommandArgs(["recall", "query", "limit:1", "limit:2"])).toThrow();
    expect(parseProjectMemoryRecallCommandArgs(["recall", "kindX", "kind:project-fact", "limit:2"])).toMatchObject({ query: "kindX", candidateKind: "project-fact", maxResults: 2 });
  });
});
