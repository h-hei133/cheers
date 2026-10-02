import fs from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { createSubagentRunner } from "./subagent.js";
import { createCoreToolRegistry } from "../core/tools/registry.js";
import type { ToolGateOptions } from "./tools.js";

it("reads and writes in the delegated workspace and scopes hooks to that same root", async () => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".subagent-context-"));
  const parent = path.join(root, "parent");
  const child = path.join(root, "child");
  try {
    for (const directory of [parent, child]) fs.mkdirSync(directory);
    fs.writeFileSync(path.join(parent, "fixture.txt"), "parent contents");
    fs.writeFileSync(path.join(child, "fixture.txt"), "child contents");
    const roots: string[] = [];
    let count = 0;
    let readResult = "";
    const run = createSubagentRunner({ defaultMaxSteps: 3, step: async (messages) => {
      count++;
      if (count === 1) return { text: "read", toolCalls: [{ id: "r", name: "read", args: { path: "fixture.txt" } }], stopReason: "stop" };
      if (count === 2) {
        readResult = String(messages.find((message) => message.role === "tool")?.content);
        return { text: "write", toolCalls: [{ id: "w", name: "write", args: { path: "fixture.txt", content: "child changed" } }], stopReason: "stop" };
      }
      return { text: "done", toolCalls: [], stopReason: "stop" };
    } }, createCoreToolRegistry(), {
      sessionId: "workspace", workspaceRoot: parent, agentMode: "build", permissionScope: "allow-all",
      hooks: { dispatch: async (event: { workspaceRoot: string }) => {
        roots.push(event.workspaceRoot);
        return { decision: "allow" };
      } } as unknown as ToolGateOptions["hooks"], emit: () => {},
    });
    const result = await run({ workspace: child, prompt: "change the child fixture", definition: {
      name: "writer", description: "writer", systemPrompt: "write", source: "builtin", tools: ["read", "write"],
    } });
    expect(result.failed).toBe(false);
    expect(readResult).toContain("child contents");
    expect(fs.readFileSync(path.join(child, "fixture.txt"), "utf8")).toBe("child changed");
    expect(fs.readFileSync(path.join(parent, "fixture.txt"), "utf8")).toBe("parent contents");
    expect(roots.length).toBeGreaterThan(0);
    expect(new Set(roots)).toEqual(new Set([child]));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
