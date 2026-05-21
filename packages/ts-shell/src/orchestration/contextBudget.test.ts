import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createContextBudgetState,
  readFileWithinContextBudget,
  redactContextText,
} from "./contextBudget.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "context-budget-"));
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("context budget and redaction", () => {
  it("includes normal files within budget", async () => {
    const target = path.join(workspaceRoot, "a.ts");
    await fs.writeFile(target, "export const value = 1;\n");
    const { result, state } = await readFileWithinContextBudget({
      filePath: target,
      workspaceRoot,
      state: createContextBudgetState(),
    });
    expect(result.decision).toBe("included");
    expect(state.bytesUsed).toBeGreaterThan(0);
  });

  it("excludes secret-like content and preserves redacted key names", async () => {
    const target = path.join(workspaceRoot, "secret.ts");
    await fs.writeFile(target, "const api_key=abcdef1234567890;\n");
    const { result } = await readFileWithinContextBudget({
      filePath: target,
      workspaceRoot,
      state: createContextBudgetState(),
    });
    expect(result.decision).toBe("omitted-secret-risk");
    expect(redactContextText("api_key=abcdef1234567890")).toBe("api_key=[redacted]");
  });
});

