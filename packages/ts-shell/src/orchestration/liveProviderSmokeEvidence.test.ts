import { describe, expect, it } from "vitest";

import { buildLiveSmokeFixture } from "./liveProviderSmokeFixture.js";
import { normalizeLiveProviderSmokeEvidence } from "./liveProviderSmokeEvidence.js";

describe("liveProviderSmokeEvidence", () => {
  it("uses fixture promptContext ids when top-level ids are absent", () => {
    const fixture = buildLiveSmokeFixture({
      fixtureId: "evidence-fixture",
      requestId: "evidence-fixture-1",
      lifecycleId: "life_from_prompt",
      analysisBriefId: "analysis_from_prompt",
      analysisQualityId: "analysis_quality_from_prompt",
      planQualityId: "plan_quality_from_prompt",
      planQualityLevel: "ready",
      contextPacketId: "ctx_from_prompt",
      contextGraphId: "graph_from_prompt",
      codeGraphTraceId: "code_trace_from_prompt",
      taskExecutionPlanId: "exec_from_prompt",
    });

    const evidence = normalizeLiveProviderSmokeEvidence({ fixture });

    expect(evidence.lifecycleId).toBe("life_from_prompt");
    expect(evidence.analysisBriefId).toBe("analysis_from_prompt");
    expect(evidence.analysisQualityId).toBe("analysis_quality_from_prompt");
    expect(evidence.planQualityId).toBe("plan_quality_from_prompt");
    expect(evidence.contextPacketId).toBe("ctx_from_prompt");
    expect(evidence.contextGraphId).toBe("graph_from_prompt");
    expect(evidence.codeGraphTraceId).toBe("code_trace_from_prompt");
    expect(evidence.taskExecutionPlanId).toBe("exec_from_prompt");
    expect(evidence.redactionStatus).toBe("redacted-and-budgeted");
    expect(evidence.missing).toEqual([]);
    expect(evidence.evidence).toContain("live-smoke-evidence:no-write:pass");
  });

  it("lets top-level ids override fixture promptContext fallbacks", () => {
    const fixture = buildLiveSmokeFixture({
      fixtureId: "evidence-override",
      requestId: "evidence-override-1",
      lifecycleId: "life_from_prompt",
      analysisBriefId: "analysis_from_prompt",
      analysisQualityId: "analysis_quality_from_prompt",
      planQualityId: "plan_quality_from_prompt",
      contextPacketId: "ctx_from_prompt",
      contextGraphId: "graph_from_prompt",
      codeGraphTraceId: "code_trace_from_prompt",
    });

    const evidence = normalizeLiveProviderSmokeEvidence({
      fixture,
      lifecycleId: "life_top",
      analysisBriefId: "analysis_top",
      analysisQualityId: "analysis_quality_top",
      planQualityId: "plan_quality_top",
      contextPacketId: "ctx_top",
      contextGraphId: "graph_top",
      codeGraphTraceId: "code_trace_top",
    });

    expect(evidence.lifecycleId).toBe("life_top");
    expect(evidence.analysisBriefId).toBe("analysis_top");
    expect(evidence.analysisQualityId).toBe("analysis_quality_top");
    expect(evidence.planQualityId).toBe("plan_quality_top");
    expect(evidence.contextPacketId).toBe("ctx_top");
    expect(evidence.contextGraphId).toBe("graph_top");
    expect(evidence.codeGraphTraceId).toBe("code_trace_top");
  });
});
