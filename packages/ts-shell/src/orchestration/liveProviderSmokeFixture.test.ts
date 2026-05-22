import { describe, expect, it } from "vitest";

import { buildLiveSmokeFixture, buildLiveSmokeExpectedAnchoredProposal, LIVE_SMOKE_FIXTURE_SOURCE } from "./liveProviderSmokeFixture.js";

describe("liveProviderSmokeFixture", () => {
  it("builds a controlled local fixture with one source file and no secrets", () => {
    const fixture = buildLiveSmokeFixture({
      fixtureId: "live-smoke-1",
      requestId: "test-fixture-1",
    });

    expect(fixture.fixtureId).toBe("live-smoke-1");
    expect(fixture.targetLabel).toBe("src/smoke.ts");
    expect(fixture.currentContent).toBe(LIVE_SMOKE_FIXTURE_SOURCE);
    expect(fixture.expectedOldText).toBe("export function startApp() {");
    expect(fixture.expectedNewText).toBe("export function runApp() {");
    expect(fixture.taskIntentLabel).toContain("rename startApp");
    expect(fixture.currentContent).toContain("export function startApp()");
  });

  it("produces a prompt context with mutationAuthority not-granted", () => {
    const fixture = buildLiveSmokeFixture({
      fixtureId: "live-smoke-2",
      requestId: "test-fixture-2",
    });

    const ctx = fixture.promptContext;
    expect(ctx.mutationAuthority).toBe("not-granted");
    expect(ctx.redactionStatus).toBe("redacted-and-budgeted");
    expect(ctx.target.pathLabel).toBe("src/smoke.ts");
    expect(ctx.providerPrompt).toBeTruthy();
    expect(ctx.providerPrompt).toContain("review-only");
    expect(ctx.evidence).toContain("context-aware-provider-prompt:mutation-authority:not-granted");
  });

  it("builds expected anchored proposal shape", () => {
    const fixture = buildLiveSmokeFixture({
      fixtureId: "live-smoke-3",
      requestId: "test-fixture-3",
    });

    const proposal = buildLiveSmokeExpectedAnchoredProposal(fixture);
    expect(proposal.operationKind).toBe("exact-fenced-replacement");
    expect(proposal.targets).toHaveLength(1);
    expect(proposal.targets[0]!.path).toBe("src/smoke.ts");
    expect(proposal.targets[0]!.oldText).toBe("export function startApp() {");
    expect(proposal.targets[0]!.newText).toBe("export function runApp() {");
  });

  it("does not contain secrets or network dependencies", () => {
    const fixture = buildLiveSmokeFixture({
      fixtureId: "live-smoke-4",
      requestId: "test-fixture-4",
    });

    const serialized = JSON.stringify(fixture);
    expect(serialized).not.toContain("api_key");
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("sk-");
    expect(serialized).not.toContain("token");
    expect(serialized).not.toContain("secret");
  });

  it("uses caller-supplied lifecycle and quality ids when provided", () => {
    const fixture = buildLiveSmokeFixture({
      fixtureId: "live-smoke-5",
      requestId: "test-fixture-5",
      lifecycleId: "my_life",
      analysisBriefId: "my_analysis",
      planQualityId: "my_quality",
    });

    const ctx = fixture.promptContext;
    expect(ctx.taskLifecycleId).toBe("my_life");
    expect(ctx.analysisBriefId).toBe("my_analysis");
  });
});
