import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildSystemPrompt } from "./systemPromptBuilder.js";

describe("Modular System Prompt Builder", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-builder-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Cleanup best effort
    }
  });

  it("builds layered prompt with tool snippets and deduplicated guidelines", () => {
    const prompt = buildSystemPrompt({
      workspaceRoot: "/workspace",
      agentMode: "build",
      tools: [
        {
          name: "read",
          promptSnippet: "Read workspace file content",
          promptGuidelines: ["Use offset/limit for large files", "Avoid reading binary files as text"],
        },
        {
          name: "write",
          promptSnippet: "Write or overwrite file content",
          promptGuidelines: ["Avoid reading binary files as text"], // Duplicate guideline
        },
      ],
    });

    expect(prompt).toContain("BUILD MODE ACTIVE");
    expect(prompt).toContain("Available tools:");
    expect(prompt).toContain("- `read`: Read workspace file content");
    expect(prompt).toContain("- `write`: Write or overwrite file content");
    expect(prompt).toContain("Tool Usage Guidelines:");
    expect(prompt).toContain("- Use offset/limit for large files");
    expect(prompt).toContain("Current working directory: /workspace");
  });

  it("ingests project context rules from AGENTS.md", () => {
    fs.writeFileSync(path.join(tempDir, "AGENTS.md"), "# Project Agent Rules\nRule 1: Be concise.", "utf8");

    const prompt = buildSystemPrompt({
      workspaceRoot: tempDir,
      agentMode: "plan",
    });

    expect(prompt).toContain("PLAN MODE ACTIVE");
    expect(prompt).toContain('<project_context path="AGENTS.md">');
    expect(prompt).toContain("Rule 1: Be concise.");
  });
});
