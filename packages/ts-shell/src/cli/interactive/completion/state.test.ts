import { afterEach, expect, it, vi } from "vitest";
import { createCatalogLoader } from "./catalog.js";
import { DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE as checkpoints } from "../../../context/compact/checkpoint/compactLiveCheckpoint.js";
import { DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE as review } from "../../../memory/projectMemoryReviewState.js";
import { runCompactCommand } from "../../../context/compact/command/compactCommandRunner.js";
import { createProjectMemoryCandidate } from "../../../memory/projectMemoryCandidate.js";
import * as extractor from "../../../memory/projectMemoryCandidateExtractor.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { CliMcpGateway } from "../../../entrypoints/cliMcpModule.js";

afterEach(() => vi.restoreAllMocks());

it("invalidates approved candidates on owner writes and checkpoint clearing without polling", async () => {
  const id = "completion-state-fixture"; const scope = `session:${id}`;
  const context = { cwd: process.cwd(), session: { id }, runtimeConfig: {} } as ShellRuntimeContext;
  const load = createCatalogLoader(() => context, {} as CliMcpGateway, []);
  const changed = vi.fn(); const stop = load.observe("approved", undefined, changed)!;
  const candidate = createProjectMemoryCandidate({ candidateKind: "project-fact", retentionClass: "project-scoped-candidate", confidence: "high", source: "system-derived", summary: "Fixture", reason: "Fixture", evidence: [] });
  vi.spyOn(extractor, "extractProjectMemoryCandidates").mockReturnValue([candidate]);
  try {
    checkpoints.updateLatest({ sessionScopeId: scope, sourceCommand: "/compact", result: runCompactCommand({ mode: "render", source: "session" }) });
    review.updateCandidates({ reviewSessionId: scope, candidates: [candidate], sourceCommand: "/memory" });
    await Promise.resolve(); expect(changed).toHaveBeenCalled(); changed.mockClear();
    expect(await load("approved", new AbortController().signal)).toEqual([]);
    review.approve({ reviewSessionId: scope, candidateId: candidate.candidateId, sourceCommand: "/memory" });
    await Promise.resolve(); expect(changed).toHaveBeenCalledOnce(); changed.mockClear();
    expect((await load("approved", new AbortController().signal)).map(item => item.value)).toEqual([candidate.candidateId]);
    checkpoints.clearLatest(scope);
    await Promise.resolve(); expect(changed).toHaveBeenCalledOnce();
    expect(await load("approved", new AbortController().signal)).toEqual([]);
    stop(); changed.mockClear();
    review.reject({ reviewSessionId: scope, candidateId: candidate.candidateId, sourceCommand: "/memory" });
    await Promise.resolve(); expect(changed).not.toHaveBeenCalled();
  } finally { stop(); checkpoints.clearLatest(scope); }
});
