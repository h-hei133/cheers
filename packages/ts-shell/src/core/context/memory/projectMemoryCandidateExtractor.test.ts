import { describe, expect, it } from "vitest";
import { runCompactCommand } from "../compactCommandRunner.js";
import { projectContextState } from "../model/contextStateProjection.js";
import { extractProjectMemoryCandidates } from "./projectMemoryCandidateExtractor.js";
import { evaluateProjectMemoryCandidateQuality } from "./projectMemoryCandidateQuality.js";
import { renderProjectMemoryCandidateSurface } from "./projectMemoryCandidateSurface.js";

describe("project memory candidate extraction", () => {
  it("extracts capability, blocked decision, route decision, validation, and explicit preference candidates", () => {
    const compact = runCompactCommand({
      mode: "render",
      source: "route",
      generatedAt: "2026-05-16T00:00:00.000Z",
      routeInfo: {
        routeId: "80",
        name: "Project memory candidate extraction",
        currentPhase: "implementation",
        nextAction: "Run focused memory candidate tests.",
      },
      projectInfo: {
        repositoryHints: [
          "Project uses RTK command discipline for reads, searches, git, tests, and builds.",
        ],
      },
      validationEvidence: {
        testsRun: ["projectMemoryCandidateExtractor.test.ts"],
        verifierResults: [
          { command: "rtk npm run verify:result-contract", status: "pending" },
        ],
      },
    });
    const candidates = extractProjectMemoryCandidates({
      compactPacket: compact.packet,
      explicitUserPreferenceFacts: [
        {
          summary: "User prefers docs-only cleanup tasks to avoid runtime edits unless explicitly reopened.",
          explicit: true,
          evidence: ["user-stated-preference:docs-only-boundary"],
        },
      ],
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateKind: "capability-state",
          retentionClass: "project-scoped-candidate",
        }),
        expect.objectContaining({
          candidateKind: "blocked-by-design-decision",
          retentionClass: "project-scoped-candidate",
        }),
        expect.objectContaining({
          candidateKind: "route-decision",
          retentionClass: "session-scoped-only",
        }),
        expect.objectContaining({
          candidateKind: "validation-pattern",
        }),
        expect.objectContaining({
          candidateKind: "user-preference-candidate",
          retentionClass: "user-memory-candidate",
          safety: "needs-review",
        }),
      ]),
    );

    const quality = evaluateProjectMemoryCandidateQuality(candidates);
    expect(quality.qualityStatus).toBe("pass");
  });

  it("extracts project facts from context projection memory candidate labels", () => {
    const projection = projectContextState({
      projectInfo: {
        projectFacts: ["TypeScript owns the control plane; Rust owns execution-plane isolation."],
      },
    });
    const candidates = extractProjectMemoryCandidates({ contextProjection: projection });

    expect(candidates).toContainEqual(
      expect.objectContaining({
        candidateKind: "project-fact",
        source: "context-projection",
        summary: "TypeScript owns the control plane; Rust owns execution-plane isolation.",
      }),
    );
  });

  it("extracts route handoff and edit closeout facts from direct inputs", () => {
    const candidates = extractProjectMemoryCandidates({
      routeHandoffFacts: [
        {
          summary: "Route 81 should add memory candidate review before storage.",
          stable: true,
          evidence: ["route-handoff:route80-next"],
        },
      ],
      editCloseoutFacts: {
        status: "closeout-candidate",
        blockedByDesign: [
          {
            id: "automatic-recovery",
            reason: "Recovery execution remains explicit-only.",
          },
        ],
        evidence: ["edit-closeout:manifest"],
      },
    });

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          candidateKind: "route-decision",
          source: "route-handoff",
          retentionClass: "project-scoped-candidate",
        }),
        expect.objectContaining({
          candidateKind: "capability-state",
          source: "system-derived",
          summary: "Edit capability closeout status is closeout-candidate.",
        }),
        expect.objectContaining({
          candidateKind: "blocked-by-design-decision",
          source: "system-derived",
          reason: "Recovery execution remains explicit-only.",
        }),
      ]),
    );
  });

  it("rejects unsafe raw content, recovery content, secrets, provider credentials, and hidden reasoning", () => {
    const candidates = extractProjectMemoryCandidates({
      unsafeFacts: [
        {
          summary: "RAW_FILE_CONTENT",
          reason: "raw file content must not be remembered",
        },
        {
          summary: "RAW_RECOVERY_CONTENT",
          reason: "raw recovery content must not be remembered",
        },
        {
          summary: "OpenAI key sk-1234567890abcdef should be saved",
          reason: "secrets and provider credentials must not be remembered",
        },
        {
          summary: "hidden reasoning: private chain-of-thought",
          reason: "hidden reasoning must not be remembered",
        },
      ],
    });

    expect(candidates).toHaveLength(4);
    expect(candidates).toEqual(
      candidates.map((candidate) =>
        expect.objectContaining({
          candidateKind: "rejected",
          retentionClass: "never-remember",
          safety: "unsafe",
        }),
      ),
    );
    expect(JSON.stringify(candidates)).not.toContain("RAW_FILE_CONTENT");
    expect(JSON.stringify(candidates)).not.toContain("RAW_RECOVERY_CONTENT");
    expect(JSON.stringify(candidates)).not.toContain("sk-1234567890abcdef");
  });

  it("does not infer user preferences from ambiguous behavior", () => {
    const candidates = extractProjectMemoryCandidates({
      explicitUserPreferenceFacts: [
        {
          summary: "User accepted one compact answer.",
          explicit: false,
          evidence: ["user-behavior:ambiguous"],
        },
      ],
    });

    expect(candidates).toEqual([
      expect.objectContaining({
        candidateKind: "rejected",
        retentionClass: "never-remember",
      }),
    ]);
  });

  it("marks transient command output as rejected and keeps the surface non-persistent", () => {
    const candidates = extractProjectMemoryCandidates({
      validationEvidence: {
        testsRun: ["projectMemoryCandidateExtractor.test.ts"],
        fullCommandOutput: "large transient command output",
      },
    });
    const surface = renderProjectMemoryCandidateSurface({
      candidates,
      quality: evaluateProjectMemoryCandidateQuality(candidates),
    });

    expect(candidates).toContainEqual(
      expect.objectContaining({
        candidateKind: "rejected",
        retentionClass: "never-remember",
        redactions: ["validationEvidence.fullCommandOutput"],
      }),
    );
    expect(surface).toContain("Memory candidates");
    expect(surface).toContain("- Memory written: no");
    expect(surface).toContain("- Persistence: none");
    expect(surface).toContain("- Cross-session loading: none");
  });
});
