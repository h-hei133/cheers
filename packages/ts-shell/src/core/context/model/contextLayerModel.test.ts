import { describe, expect, it } from "vitest";
import {
  CONTEXT_LAYER_DEFINITIONS,
  getContextLayerDefinition,
  isCompactSurvivorLayer,
  isMemoryCandidateLayer,
  isSidebarCandidateLayer,
  isStartupWarmCandidateLayer,
} from "./contextLayerModel.js";

describe("context layer model", () => {
  it("defines the Route 74 context layers once", () => {
    const ids = CONTEXT_LAYER_DEFINITIONS.map((entry) => entry.id);

    expect(ids).toEqual([
      "immediate-prompt",
      "task-goal",
      "project",
      "route-history",
      "edit-capability",
      "mutation-evidence",
      "recovery-restore",
      "tool-availability",
      "compact-summary",
      "memory-candidate",
      "sidebar-state",
      "startup-warm",
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("classifies compact, memory, sidebar, and startup candidates", () => {
    expect(isCompactSurvivorLayer("edit-capability")).toBe(true);
    expect(isCompactSurvivorLayer("immediate-prompt")).toBe(false);
    expect(isMemoryCandidateLayer("memory-candidate")).toBe(true);
    expect(isMemoryCandidateLayer("mutation-evidence")).toBe(false);
    expect(isSidebarCandidateLayer("sidebar-state")).toBe(true);
    expect(isStartupWarmCandidateLayer("startup-warm")).toBe(true);
  });

  it("keeps recovery references compact survivable without raw-content sensitivity", () => {
    expect(getContextLayerDefinition("recovery-restore")).toEqual(
      expect.objectContaining({
        retentionClass: "compact-survivor",
        payloadKind: "recovery-authority-reference",
        compactSurvivable: true,
        sensitivity: "project-internal",
      }),
    );
  });
});
