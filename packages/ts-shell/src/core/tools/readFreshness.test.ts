import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import { createCoreToolRegistry } from "./registry.js";
import { createDefaultExecutionService } from "../../runtime/execution/service.js";
import { createSubagentRunner } from "../../turn/subagent.js";

let workspaceRoot: string;
const sessionId = "read-freshness";
beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(process.cwd(), ".read-freshness-"));
  await fs.writeFile(path.join(workspaceRoot, "file.txt"), "before\n");
});
afterEach(async () => { await fs.rm(workspaceRoot, { recursive: true, force: true }); });

it("returns current content when an external write preserves the mtime", async () => {
  const file = path.join(workspaceRoot, "file.txt");
  const stamp = new Date("2026-10-01T00:00:00Z");
  await fs.utimes(file, stamp, stamp);
  const read = createCoreToolRegistry().get("read")!;
  const context = { workspaceRoot, sessionId, taskId: "mtime" };
  expect((await read.execute({ path: "file.txt" }, context)).output).toBe("before\n");
  await fs.writeFile(file, "after!\n");
  await fs.utimes(file, stamp, stamp);
  expect((await read.execute({ path: "file.txt" }, context)).output).toBe("after!\n");
});

it("does not certify earlier bytes with a modification time observed after a read", async () => {
  const execution = createDefaultExecutionService();
  let first = true;
  const registry = createCoreToolRegistry({ executionService: { ...execution, readTextFile: async (request) => {
    const content = await execution.readTextFile(request);
    if (first) {
      first = false;
      await fs.writeFile(request.absolutePath, "changed during read\n");
    }
    return content;
  } } });
  const context = { workspaceRoot, sessionId, taskId: "concurrent" };
  expect((await registry.get("read")!.execute({ path: "file.txt" }, context)).output).toBe("before\n");
  expect((await registry.get("read")!.execute({ path: "file.txt" }, context)).output).toBe("changed during read\n");
});

it("gives a shared-workspace child content even when the parent already read it", async () => {
  const registry = createCoreToolRegistry();
  await registry.get("read")!.execute({ path: "file.txt" }, { workspaceRoot, sessionId, taskId: "parent" });
  let steps = 0;
  let observation = "";
  const run = createSubagentRunner({ defaultMaxSteps: 2, step: async (messages) => {
    if (++steps === 1) return { text: "read", toolCalls: [{ id: "read", name: "read", args: { path: "file.txt" } }], stopReason: "stop" };
    observation = String(messages.find((message) => message.role === "tool")?.content);
    return { text: "done", toolCalls: [], stopReason: "stop" };
  } }, registry, { workspaceRoot, sessionId, agentMode: "plan", permissionScope: "allow-all",
    hooks: { dispatch: async () => ({ decision: "allow" }) }, emit: () => {},
  });
  const result = await run({ workspace: workspaceRoot, prompt: "read the file", definition: {
    name: "reader", description: "reader", systemPrompt: "read", source: "builtin", tools: ["read"],
  } });
  expect(result.failed).toBe(false);
  expect(observation).toContain("before\n");
});

it("reads from disk when a new conversation reuses a session identifier", async () => {
  const context = { workspaceRoot, sessionId, taskId: "first-turn" };
  await createCoreToolRegistry().get("read")!.execute({ path: "file.txt" }, context);
  const newConversation = createCoreToolRegistry();
  expect((await newConversation.get("read")!.execute({ path: "file.txt" }, { ...context, taskId: "new-turn" })).output).toBe("before\n");
});
