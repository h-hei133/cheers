import { describe, expect, it } from "vitest";
import { runCompactCommand } from "./compactCommandRunner.js";
import { formatCompactCheckpointStatus } from "./compactCheckpointSurface.js";
import {
  createCompactLiveCheckpointStore,
  updateLatestCompactCheckpoint,
} from "./compactLiveCheckpoint.js";

describe("compact checkpoint surface", () => {
  it("renders missing and existing checkpoint status without exposing packet content", () => {
    expect(formatCompactCheckpointStatus(undefined)).toContain(
      "- Latest: none",
    );

    const store = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-surface",
    });
    const result = runCompactCommand({
      mode: "render",
      source: "session",
      generatedAt: "2026-05-15T00:00:00.000Z",
      routeInfo: {
        routeId: "77",
        name: "Compact live checkpoint",
        nextAction: "Route 78 will wire injection.",
      },
      mutationEvidence: {
        changedFiles: ["src/changed.ts"],
        rawOriginalContent: "RAW_CONTENT",
      },
    });
    const checkpoint = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:surface",
      sourceCommand: "/compact",
      result,
    });
    const output = formatCompactCheckpointStatus(checkpoint);

    expect(output).toContain("Compact checkpoint");
    expect(output).toContain("- Latest: exists");
    expect(output).toContain("- Checkpoint id: checkpoint-surface");
    expect(output).toContain("- Future-turn adapter: ready-for-adapter");
    expect(output).toContain("- Injection: not-yet-injected");
    expect(output).toContain("- Next action: Route 78 will wire injection.");
    expect(output).not.toContain("RAW_CONTENT");
    expect(output).not.toContain('"packetVersion"');
  });
});
