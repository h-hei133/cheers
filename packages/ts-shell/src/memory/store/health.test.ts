import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildCliCommandExecution } from "../../entrypoints/cliCommandExecutionBridge.js";
import { routeSlashCommand } from "../../core/commands/slashRouter.js";
import { createProjectMemoryLocalStore } from "../projectMemoryLocalStore.js";
import { projectMemoryRootFor } from "../projectMemoryRoot.js";
import type { ProjectMemoryStore, ProjectMemoryStoreMode } from "../projectMemoryStoreContract.js";

const commands = ["/memory", "/memory status", "/compact preview", "/memory use", "/memory recall project", "/memory wake", "/memory delete missing"];
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-memory-health-")); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

async function outputFor(command: string, projectMemoryStore?: ProjectMemoryStore): Promise<string> {
  const result = await routeSlashCommand(command, { cwd: root, sessionId: root, projectMemoryStore });
  if (result?.kind !== "local") throw new Error(`Expected a local result for ${command}`);
  return result.output;
}

describe("memory store observations", () => {
  it("gives review and status the same real store through the CLI assembly without writing", async () => {
    for (const prompt of ["/memory", "/memory status", "/compact preview"]) {
      const lines: string[] = [];
      await buildCliCommandExecution({
        prompt, cwd: root, printMode: true, interactive: false,
        renderer: { renderLine: (line: string) => lines.push(line) } as never,
      });
      const output = lines.join("\n");
      expect(output).toContain("- Store mode: explicit-local");
      expect(output).toContain("- Store readable: yes");
      expect(output).toContain("- Store writable: yes");
      expect(output).toContain("- Memory written: no");
      expect(output).not.toContain("Persistence: not enabled");
    }
    expect(fs.existsSync(path.join(projectMemoryRootFor(root), "project-memory.jsonl"))).toBe(false);
  });

  it.each<ProjectMemoryStoreMode>(["disabled", "test-only", "explicit-local"])("keeps every command consistent for %s", async (mode) => {
    const store = createProjectMemoryLocalStore({ ref: { mode, root } });
    for (const command of commands) {
      const output = await outputFor(command, store);
      expect(output, command).toContain(`- Store mode: ${mode}`);
      expect(output, command).toContain(`- Store writable: ${mode === "disabled" ? "no" : "yes"}`);
      expect(output, command).toContain(`- Store readable: ${mode === "disabled" ? "no" : "yes"}`);
      expect(output, command).toContain(mode === "disabled" ? "unavailable (store not readable)" : "available on explicit request");
    }
    expect(fs.readdirSync(root)).toEqual([]);
  });

  it("observes disabled when no store is configured", async () => {
    for (const command of commands) {
      const output = await outputFor(command);
      expect(output, command).toContain("- Store mode: disabled");
      expect(output, command).toContain("- Store writable: no");
      expect(output, command).toContain("- Store readable: no");
    }
  });

  it("rechecks health and preserves readable degraded storage without claiming a write", async () => {
    const store = createProjectMemoryLocalStore({ ref: { mode: "explicit-local", root } });
    const file = path.join(root, "project-memory.jsonl");
    expect(await outputFor("/memory", store)).toContain("- Store writable: yes");
    fs.writeFileSync(file, "damaged entry\n");
    for (const command of commands) {
      const output = await outputFor(command, store);
      expect(output, command).toContain("- Store mode: explicit-local");
      expect(output, command).toContain("- Store readable: yes");
      expect(output, command).toContain("- Store writable: no");
      expect(output, command).toContain("- Store health: degraded");
      expect(output, command).toContain("- Warning:");
      expect(output, command).toContain("available on explicit request");
    }
    expect(fs.readFileSync(file, "utf8")).toBe("damaged entry\n");
    fs.unlinkSync(file);
    expect(await outputFor("/memory", store)).toContain("- Store writable: yes");
  });

  it("reports unreadable storage separately from a disabled store", async () => {
    const recordsFile = path.join(root, "records");
    fs.mkdirSync(recordsFile);
    const store = createProjectMemoryLocalStore({ ref: { mode: "explicit-local", root, recordsFile } });
    for (const command of commands) {
      const output = await outputFor(command, store);
      expect(output, command).toContain("- Store mode: explicit-local");
      expect(output, command).toContain("- Store readable: no");
      expect(output, command).toContain("- Store writable: no");
      expect(output, command).toContain("- Store health: degraded");
      expect(output, command).toContain("unavailable (store not readable)");
    }
  });
});
