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
