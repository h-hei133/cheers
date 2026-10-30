import { describe, expect, it, vi } from "vitest";
import { parseRefutations } from "./teamTool.js";
import { createTeamToolDefinition } from "./teamTool.js";
import { createHash } from "node:crypto";
import type { SubagentRunInput } from "../subagents/runner.js";
import type { ToolExecutionContext } from "../../tools/types.js";

/**
 * The tool's two jobs: parse a reviewer's reply without inventing findings,
 * and refuse to start a pass it cannot run.
 *
 * Evidence has to be stated. A path that merely appears in the reason is
 * prose — a reviewer can write any path it likes — so it stays an opinion,
 * and convergence will not let it refute.
 */

describe("reading a reviewer's findings", () => {
  it("reads one finding per claim", () => {
    const findings = parseRefutations(
      "CLAIM p1 counterevidence The profile shows no misses. evidence: src/cache.ts\n"
      + "CLAIM p2 none-found Read the config. evidence: config/runtime.json",
      "p3", ["p1", "p2"],
    );

    expect(findings).toEqual([
      { proposalId: "p1", reviewerId: "p3", kind: "counterevidence", reason: "The profile shows no misses.", evidence: ["src/cache.ts"] },
      { proposalId: "p2", reviewerId: "p3", kind: "none-found", reason: "Read the config.", evidence: ["config/runtime.json"] },
    ]);
  });

  it("keeps a finding with no stated evidence as an opinion", () => {
    const findings = parseRefutations("CLAIM p1 counterevidence I doubt it.", "p3", ["p1"]);

    expect(findings[0]?.evidence).toEqual([]);
  });

  it("does not treat a path mentioned in the reason as evidence", () => {
    // The reviewer can write any path it likes; only a stated `evidence:` field
    // is a claim about what it read.
    const findings = parseRefutations("CLAIM p1 counterevidence src/cache.ts says otherwise.", "p3", ["p1"]);

    expect(findings[0]?.evidence).toEqual([]);
  });

  it("ignores a finding about a claim nobody made", () => {
    expect(parseRefutations("CLAIM ghost counterevidence nonsense", "p3", ["p1"])).toEqual([]);
  });

  it("keeps only the first finding for a claim", () => {
    const findings = parseRefutations(
      "CLAIM p1 counterevidence first. evidence: a.ts\nCLAIM p1 none-found second. evidence: b.ts",
      "p3", ["p1"],
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.reason).toBe("first.");
  });

  it("produces nothing from prose that is not in the format", () => {
    expect(parseRefutations("I read the files and have concerns.", "p3", ["p1"])).toEqual([]);
  });
});

describe("starting a team pass", () => {
  const context = (overrides: Partial<ToolExecutionContext> = {}) => ({
    workspaceRoot: "/repo", taskId: "task", ...overrides,
  }) as unknown as ToolExecutionContext;

  it("refuses without a question", async () => {
    const result = await createTeamToolDefinition().execute({ perspectives: ["a", "b"] }, context());
    expect(result.error).toContain('needs a question');
  });

  it("refuses with fewer than two perspectives", async () => {
    const result = await createTeamToolDefinition().execute({ question: "why?", perspectives: ["a"] }, context());
    expect(result.error).toContain('at least two distinct perspectives');
  });

  it("refuses identical perspectives", async () => {
    const result = await createTeamToolDefinition().execute({ question: "why?", perspectives: ["same", "same"] }, context());
    expect(result.error).toContain('must differ');
  });

  it("refuses when no model is available", async () => {
    const result = await createTeamToolDefinition().execute({ question: "why?", perspectives: ["a", "b"] }, context());
    expect(result.error).toContain('no model is available');
  });

  it("keeps an invented citation unresolved", async () => {
    const runSubagent = vi.fn(async (input: { prompt: string }) => ({
      text: input.prompt.includes("CLAIM")
        ? "CLAIM p1 counterevidence The profile disagrees. evidence: src/profile.ts"
        : "the cache is the bottleneck",
      failed: false,
    }));
    const result = await createTeamToolDefinition().execute(
      { question: "why is it slow?", perspectives: ["profile", "read config"] },
      context({ runSubagent } as unknown as Partial<ToolExecutionContext>),
    );

    expect(result.output).toContain('p1: unresolved');
    expect(result.output).toContain('Limitation:');
  });

  it("gives every proposer a fixed name, whatever the perspective says", async () => {
    // The definition name is what a task deny rule matches against. Building it
    // from the perspective — text the model chose — would let a crafted role
    // dodge a rule meant to stop delegation.
    const names: string[] = [];
    const runSubagent = vi.fn(async (input: { definition: { name: string } }) => {
      names.push(input.definition.name);
      return { text: "a claim", failed: false };
    });
    await createTeamToolDefinition().execute(
      { question: "why?", perspectives: ["task", "review"] },
      context({ runSubagent } as unknown as Partial<ToolExecutionContext>),
    );

    expect(new Set(names)).toEqual(new Set(["team-proposer"]));
  });

  it("does not hand the runner an admission that always allows", async () => {
    // The host's runner already carries the session gate. Supplying a
    // predicate that answers "allowed" unconditionally would replace it with a
    // rubber stamp, which is worse than supplying none.
    const calls: { admission?: unknown }[] = [];
    const runSubagent = vi.fn(async (input: { admission?: unknown }) => {
      calls.push({ admission: input.admission });
      return { text: "a claim", failed: false };
    });
    await createTeamToolDefinition().execute(
      { question: "why?", perspectives: ["a", "b"] },
      context({ runSubagent, taskId: "task-1" } as unknown as Partial<ToolExecutionContext>),
    );

    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(call => call.admission === undefined)).toBe(true);
  });

  it("names a proposer that produced nothing", async () => {
    const runSubagent = vi.fn(async (input: { prompt: string }) => input.prompt.includes("CLAIM")
      ? { text: "", failed: false }
      : { text: "", failed: true, failure: "the proposer failed" });
    const result = await createTeamToolDefinition().execute(
      { question: "why?", perspectives: ["a", "b"] },
      context({ runSubagent } as unknown as Partial<ToolExecutionContext>),
    );

    expect(result.output).toContain('Proposed 0 of 2');
  });
});


function observedRead(input: SubagentRunInput, overrides: Record<string, unknown> = {}) {
  const text = "cache misses: 0\n";
  return input.observeTool?.({
    call: { id: "read-1", name: "read", args: { path: "src/profile.ts" } },
    args: { path: "src/profile.ts" }, assistantMessage: { role: "assistant", content: "reading" },
    isError: false,
    result: { output: text, isError: false, metadata: {
      read: { text, startLine: 4, endLine: 4, bytesRead: text.length },
      provenance: { locator: "src/profile.ts", contentHash: createHash("sha256").update(text).digest("hex"),
        hashScope: "selected-text", parser: "utf8", location: "lines" },
    } }, ...overrides,
  });
}

it.each(["counterevidence", "none-found"])("does not accept an unread %s citation", async kind => {
  const tool = createTeamToolDefinition();
  const result = await tool.execute({ question: "why?", perspectives: ["a", "b"] }, {
    workspaceRoot: "/repo", taskId: "unread",
    runSubagent: async input => ({ text: input.prompt.includes("CLAIM")
      ? `CLAIM p1 ${kind} I checked. evidence: src/profile.ts` : "a claim", failed: false, steps: 1, allowedTools: [] }),
  });
  expect(result.output).toContain("p1: unresolved");
});

it("binds a finding to its current review receipt and asks for that exact format", async () => {
  let receipt = "";
  const result = await createTeamToolDefinition().execute({ question: "why?", perspectives: ["a", "b"] }, {
    workspaceRoot: "/repo", taskId: "bound",
    runSubagent: async input => {
      if (!input.prompt.includes("CLAIM")) return { text: "a claim", failed: false, steps: 1, allowedTools: [] };
      expect(input.prompt).toContain("evidence:");
      expect(input.prompt).toContain("receipt");
      const observation = await observedRead(input);
      expect(observation?.suffix).toContain("lines 4-4");
      receipt = /receipt: (\S+)/.exec(observation?.suffix ?? "")?.[1] ?? "";
      expect(receipt).not.toBe("");
      return { text: `CLAIM p1 counterevidence The profile disagrees. evidence: ${receipt}`, failed: false, steps: 2, allowedTools: ["read"] };
    },
  });
  expect(result.output).toContain("p1: refuted");
  expect(result.metadata).toMatchObject({ evidence: expect.arrayContaining([expect.objectContaining({ id: receipt,
    locator: "src/profile.ts", start: 4, end: 4, location: "lines" })]) });
});

it.each(["failed", "directory", "empty", "wrong-hash"])("does not issue a receipt for a %s read", async scenario => {
  const result = await createTeamToolDefinition().execute({ question: "why?", perspectives: ["a", "b"] }, {
    workspaceRoot: "/repo", taskId: scenario,
    runSubagent: async input => {
      if (!input.prompt.includes("CLAIM")) return { text: "a claim", failed: false, steps: 1, allowedTools: [] };
      const observation = await observedRead(input, scenario === "failed" ? { isError: true } : {
        result: { output: "a file", isError: false, metadata: scenario === "directory" ? {} : {
          read: { text: scenario === "empty" ? " " : "different", startLine: 4, endLine: 4 },
          provenance: { locator: "src/profile.ts", contentHash: "0".repeat(64), parser: "utf8", location: "lines", hashScope: "selected-text" },
        } },
      });
      expect(observation?.suffix).toBeUndefined();
      return { text: "CLAIM p1 none-found All fine. evidence: src/profile.ts", failed: false, steps: 2, allowedTools: ["read"] };
    },
  });
  expect(result.output).toContain("p1: unresolved");
});

it("cannot borrow the other reviewer's receipt or a proposer citation", async () => {
  let stolen = "src/profile.ts";
  const result = await createTeamToolDefinition().execute({ question: "why?", perspectives: ["a", "b"] }, {
    workspaceRoot: "/repo", taskId: "isolation",
    runSubagent: async input => {
      if (!input.prompt.includes("CLAIM")) {
        await observedRead(input);
        return { text: "a claim evidence: src/profile.ts", failed: false, steps: 1, allowedTools: [] };
      }
      if (input.prompt.includes("[p2]")) {
        const observed = await observedRead(input);
        stolen = /receipt: (\S+)/.exec(observed?.suffix ?? "")?.[1] ?? stolen;
        return { text: "CLAIM p2 insufficient Could not check.", failed: false, steps: 2, allowedTools: ["read"] };
      }
      await new Promise(resolve => setTimeout(resolve, 0));
      return { text: `CLAIM p1 counterevidence Borrowed. evidence: ${stolen}`, failed: false, steps: 1, allowedTools: [] };
    },
  });
  expect(result.output).toContain("p1: unresolved");
});

it("uses final answers instead of intermediate proposal and review narration", async () => {
  const result = await createTeamToolDefinition().execute({ question: "why?", perspectives: ["a", "b"] }, {
    workspaceRoot: "/repo", taskId: "final",
    runSubagent: async input => {
      if (!input.prompt.includes("CLAIM")) return { text: "intermediate\n\nfinal claim", finalText: "final claim", failed: false, steps: 2, allowedTools: [] };
      expect(input.prompt).not.toContain("intermediate");
      const observed = await observedRead(input);
      const id = /receipt: (\S+)/.exec(observed?.suffix ?? "")?.[1];
      return { text: `CLAIM p1 counterevidence Intermediate. evidence: ${id}`, finalText: "CLAIM p1 insufficient Cannot conclude.",
        failed: false, steps: 2, allowedTools: ["read"] };
    },
  });
  expect(result.output).toContain("p1: unresolved");
  expect(result.metadata).toMatchObject({ proposals: [expect.objectContaining({ claim: "final claim" }), expect.objectContaining({ claim: "final claim" })] });
});

it("does not fall back to narration when the final answer is explicitly empty", async () => {
  const result = await createTeamToolDefinition().execute({ question: "why?", perspectives: ["a", "b"] }, {
    workspaceRoot: "/repo", taskId: "empty-final", runSubagent: async () => ({ text: "I am looking", finalText: "", failed: false, steps: 1, allowedTools: [] }),
  });
  expect(result.output).toContain("Proposed 0 of 2");
});
