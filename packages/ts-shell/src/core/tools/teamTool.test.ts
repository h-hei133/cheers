import { describe, expect, it, vi } from "vitest";
import { parseRefutations } from "./teamTool.js";
import { createTeamToolDefinition } from "./teamTool.js";
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

  it("reports what survived when every proposer answers", async () => {
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

    expect(result.output).toContain('p1: refuted');
    expect(result.output).toContain('Limitation:');
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
