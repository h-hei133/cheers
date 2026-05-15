import { describe, expect, it } from "vitest";
import {
  CONTEXT_CONTINUITY_MANIFEST,
  listContextContinuityManifestEntries,
} from "./contextContinuityManifest.js";

describe("context continuity manifest", () => {
  it("defines machine-checkable compact survivor and redaction boundaries", () => {
    expect(CONTEXT_CONTINUITY_MANIFEST).toEqual(
      expect.objectContaining({
        route: "74",
        status: "baseline-candidate",
        editCloseoutSource: "Route 73 editCapabilityCloseoutManifest",
        compactSurvivorFactsAreMachineCheckable: true,
        rawOriginalContentSurvivesCompact: false,
        secretsSurviveCompact: false,
        automaticRecoveryImplied: false,
        atomicRollbackImplied: false,
      }),
    );
  });

  it("requires Route 73 edit and recovery facts to survive compact safely", () => {
    const must = CONTEXT_CONTINUITY_MANIFEST.mustSurviveCompact.map(
      (entry) => entry.id,
    );

    expect(must).toEqual(
      expect.arrayContaining([
        "current-task-goal",
        "edit-closeout-status",
        "supported-edit-envelope",
        "blocked-edit-capabilities",
        "last-mutation-files",
        "recovery-availability-summary",
        "restore-authority-reference",
        "validation-status-summary",
        "unresolved-blockers-next-action",
      ]),
    );
  });

  it("blocks raw content, secrets, command output, and broad file dumps from compact survival", () => {
    const blocked = CONTEXT_CONTINUITY_MANIFEST.mustNotSurviveCompact.map(
      (entry) => entry.id,
    );

    expect(blocked).toEqual(
      expect.arrayContaining([
        "raw-original-content",
        "raw-secrets",
        "raw-recovery-content",
        "full-command-output",
        "hidden-chain-of-thought",
        "broad-raw-file-dumps",
      ]),
    );
  });

  it("keeps memory, sidebar, and startup candidates separate", () => {
    expect(
      listContextContinuityManifestEntries("memoryCandidateOnly").map(
        (entry) => entry.section,
      ),
    ).toEqual(["memoryCandidateOnly", "memoryCandidateOnly", "memoryCandidateOnly"]);
    expect(
      listContextContinuityManifestEntries("sidebarOnly").map(
        (entry) => entry.layer,
      ),
    ).toEqual(["sidebar-state", "sidebar-state", "sidebar-state"]);
    expect(
      listContextContinuityManifestEntries("startupWarmCandidate").map(
        (entry) => entry.section,
      ),
    ).toEqual(["startupWarmCandidate", "startupWarmCandidate"]);
  });

  it("has one unique id per manifest entry", () => {
    const entries = listContextContinuityManifestEntries();
    const ids = entries.map((entry) => entry.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(entries.length).toBeGreaterThan(25);
  });
});
