import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeRemoveDir } from "../test-utils/cleanup.js";
import { runMvpIntegratedFlow } from "./runMvpIntegratedFlow.js";

describe("MVP integrated end-to-end flow (T10)", () => {
  const workspaceRoot = path.join(os.tmpdir(), "private-agents-t10-workspace");

  afterEach(async () => {
    await safeRemoveDir(workspaceRoot);
  });

  it("covers prompt -> handoff -> tool approval -> streamed result", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-workspace" }, null, 2),
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_happy",
      prompt:
        "Check current node version and continue with tool-assisted implementation",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    expect(result.transcript.map((turn) => turn.role)).toEqual([
      "planner",
      "coder",
      "reviewer",
    ]);

    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("workflow: branch=");
    expect(mergedNotes).toContain("mcp: clients=");
    expect(mergedNotes).toContain("plan: intent=run-command");
    expect(mergedNotes).toContain("bash(node --version)");

    expect(result.transcript[0]?.content).toContain("PLANNER:");
    expect(result.transcript[1]?.content).toContain("CODER:");
    expect(result.transcript[2]?.content).toContain("REVIEWER:");
    expect(result.finalOutput).toContain("REVIEWER:");
  }, 15000);

  it("derives file-oriented intent from prompt and uses glob without default bash demo path", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-file-intent" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "index.ts"),
      "export {}\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_file_intent",
      prompt: "List TypeScript files for this workspace",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("completed");
    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("plan: intent=inspect-files");
    expect(mergedNotes).toContain("glob(.ts)");
    expect(mergedNotes).not.toContain("bash(");
  }, 15000);

  it("denies escalation and terminates with explicit stopped_error terminal", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "t10-workspace" }, null, 2),
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "index.ts"),
      "export {}\n",
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_forbidden",
      prompt:
        "Run forbidden operation but continue safely after denied escalation",
      workspaceRoot,
      escalationDecision: "deny",
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("error");
    expect(result.stopReason).toContain("Approval denied by user for bash");

    expect(result.transcript.map((turn) => turn.role)).toEqual(["planner"]);

    const mergedNotes = result.sharedContext.notes.join("\n");
    expect(mergedNotes).toContain("workflow: branch=");
    expect(mergedNotes).toContain("mcp: clients=");
    expect(result.finalOutput).toContain("PLANNER:");
  }, 15000);

  it("uses explicit escalation callback instead of prompt-derived synthetic decisions", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-explicit"}\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "index.ts"),
      "export {}\n",
      "utf8",
    );

    const prompts: string[] = [];
    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_explicit_callback",
      prompt: "Please continue implementation.",
      workspaceRoot,
      escalationDecision: "allow-once",
      escalationPromptHandler: async (prompt) => {
        prompts.push(prompt.id);
        return {
          promptId: prompt.id,
          decision: "deny",
          respondedAt: Date.now(),
          userComment: "explicit callback deny",
        };
      },
      maxTurns: 6,
    });

    expect(prompts.length).toBeGreaterThan(0);
    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("error");
    expect(result.stopReason).toContain("Approval denied by user for bash");
  }, 15000);

  it("fails fast when real provider mode has no API key", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-real-provider"}\n',
      "utf8",
    );

    const previousKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      const result = await runMvpIntegratedFlow({
        sessionId: "sess_t10_real_provider_missing_key",
        prompt: "Implement a real task path",
        workspaceRoot,
        escalationDecision: "allow-once",
        providerMode: "real",
        maxTurns: 6,
      });

      expect(result.status).toBe("stopped_error");
      expect(result.terminalClassification).toBe("error");
      expect(result.stopReason).toContain(
        "OPENAI_API_KEY is required for the real provider path",
      );
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  }, 15000);

  it("keeps planner/coder/reviewer provider semantics aligned in real mode", async () => {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-real-provider-aligned"}\n',
      "utf8",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "index.ts"),
      "export {}\n",
      "utf8",
    );

    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "test-real-provider-key";

    const originalFetch = globalThis.fetch;
    const authHeaders: string[] = [];
    let callIndex = 0;

    globalThis.fetch = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        callIndex += 1;
        const headers = init?.headers as Record<string, string> | undefined;
        authHeaders.push(headers?.authorization ?? "");

        const body =
          `data: ${JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [
              { delta: { content: `REAL_PROVIDER_CALL_${callIndex}` } },
            ],
          })}\n\n` +
          `data: ${JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [{ delta: { content: "" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          })}\n\n` +
          "data: [DONE]\n\n";

        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      },
    ) as typeof fetch;

    try {
      const result = await runMvpIntegratedFlow({
        sessionId: "sess_t10_real_provider_aligned",
        prompt: "List TypeScript files for this workspace",
        workspaceRoot,
        escalationDecision: "allow-once",
        providerMode: "real",
        maxTurns: 6,
      });

      expect(result.status).toBe("completed");
      expect(result.transcript.map((turn) => turn.role)).toEqual([
        "planner",
        "coder",
        "reviewer",
      ]);
      expect(result.transcript[0]?.content).toContain("REAL_PROVIDER_CALL_1");
      expect(result.transcript[1]?.content).toContain("REAL_PROVIDER_CALL_2");
      expect(result.transcript[2]?.content).toContain("REAL_PROVIDER_CALL_3");
      expect(result.finalOutput).toContain("REAL_PROVIDER_CALL_3");

      expect(callIndex).toBe(3);
      expect(authHeaders).toEqual([
        "Bearer test-real-provider-key",
        "Bearer test-real-provider-key",
        "Bearer test-real-provider-key",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
      if (previousKey === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = previousKey;
      }
    }
  }, 15000);

  it("blocks command intents outside MVP allowlist with actionable stopped_error", async () => {
    await fs.mkdir(workspaceRoot, { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      '{"name":"t10-blocked-command"}\n',
      "utf8",
    );

    const result = await runMvpIntegratedFlow({
      sessionId: "sess_t10_blocked_command",
      prompt: "Please deploy this project now",
      workspaceRoot,
      escalationDecision: "allow-once",
      maxTurns: 6,
    });

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("error");
    expect(result.stopReason).toContain(
      "Run-command intent is not allowed in the MVP allowlist",
    );
    expect(result.stopReason).toContain("Allowed commands:");

    // Blocked command should terminate before coder output is committed.
    expect(result.transcript.map((turn) => turn.role)).toEqual(["planner"]);
  }, 15000);
});
