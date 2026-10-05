import { describe, expect, it } from "vitest";
import {
  CompactCommandContractError,
  normalizeCompactCommandRequest,
  parseCompactCommandArgs,
} from "./compactCommandContract.js";

describe("compact command contract", () => {
  it("defaults to render mode with preview-only non-mutating boundaries", () => {
    const request = parseCompactCommandArgs([], {
      generatedAt: "2026-05-15T00:00:00.000Z",
    });

    expect(request).toEqual(
      expect.objectContaining({
        mode: "render",
        source: "session",
        generatedAt: "2026-05-15T00:00:00.000Z",
        previewOnly: true,
        includeMarkdown: true,
        includeJson: false,
        persistence: "none",
        providerCall: "none",
        recoveryExecution: "none",
      }),
    );
    expect(request.evidence).toEqual(
      expect.arrayContaining([
        "compact-command-contract:no-persistence",
        "compact-command-contract:no-provider-call",
        "compact-command-contract:no-recovery-execution",
      ]),
    );
  });

  it("rejects incompatible or mutating command flags", () => {
    expect(() => parseCompactCommandArgs(["--preview", "--json"])).toThrow(
      CompactCommandContractError,
    );
    expect(() => parseCompactCommandArgs(["--execute"])).toThrow(
      /preview-only/,
    );
    expect(() => parseCompactCommandArgs(["--raw-content", "secret"])).toThrow(
      /raw content/,
    );
  });

  it.each([
    ["--preview=false"], ["--render=false"], ["--json=false"], ["--unknown"],
    ["--constraint"], ["--source", "other"], ["--goal", "a", "--objective", "b"],
    ["preview", "--json"], ["render", "--render"], ["--preview", "--render"],
  ])("rejects malformed artifact arguments %j", (...args) => {
    expect(() => parseCompactCommandArgs(args)).toThrow(CompactCommandContractError);
  });

  it("keeps repeated constraints and consumes metadata values separately from instructions", () => {
    const request = parseCompactCommandArgs(["--goal", "json", "--constraint", "first", "--constraint=second", "--source", "manual"]);
    expect(request.mode).toBe("render");
    expect(request.source).toBe("manual");
    expect(request.taskGoal).toMatchObject({ objective: "json", constraints: ["first", "second"] });
    expect(parseCompactCommandArgs(["--render"]).mode).toBe("render");
    expect(parseCompactCommandArgs(["--", "--execute"]).mode).toBe("render");
  });

  it("rejects raw top-level fields while allowing nested fields to be redacted downstream", () => {
    expect(() =>
      normalizeCompactCommandRequest({
        mode: "render",
        rawContent: "do not keep",
      } as Parameters<typeof normalizeCompactCommandRequest>[0] & {
        rawContent: string;
      }),
    ).toThrow(/raw or sensitive top-level field/);

    const request = normalizeCompactCommandRequest({
      mode: "render",
      mutationEvidence: {
        changedFiles: ["src/a.ts"],
        rawOriginalContent: "redact downstream",
      },
    });
    expect(request.mutationEvidence?.rawOriginalContent).toBe(
      "redact downstream",
    );
  });
});
