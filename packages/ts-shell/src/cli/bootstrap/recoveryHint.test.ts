import { expect, it, vi } from "vitest";
import type { Session, SessionReentrySummary } from "../../session/SessionManager.js";
import { loadRecoveryHint } from "./recoveryHint.js";

const candidate = { id: "sess_candidate" } as Session;
const summary = {
  id: candidate.id,
  resumeDisposition: "fully-resumable",
} as SessionReentrySummary;
const candidateHint = { candidate, summary };

it("returns a completed hint when the generation is unchanged", async () => {
  const getRecoveryHintAsync = vi.fn(async () => candidateHint);
  const result = await loadRecoveryHint({
    sessionManager: { getRecoveryHintAsync },
    preferredProjectRoot: "/workspace",
    currentSessionId: "sess_current",
    generation: () => "session:project:config",
  });

  expect(result).toEqual({ candidate, summary });
  expect(getRecoveryHintAsync).toHaveBeenCalledWith({
    preferredProjectRoot: "/workspace",
    currentSessionId: "sess_current",
  });
});

it("discards a late hint after the generation changes", async () => {
  let generation = "before";
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const getRecoveryHintAsync = vi.fn(async () => {
    await gate;
    return { candidate, summary };
  });
  const pending = loadRecoveryHint({
    sessionManager: { getRecoveryHintAsync },
    preferredProjectRoot: "/workspace",
    generation: () => generation,
  });

  generation = "after";
  release();

  await expect(pending).resolves.toBeNull();
});

it("does not publish a hint after cancellation", async () => {
  const controller = new AbortController();
  const getRecoveryHintAsync = vi.fn(async () => {
    controller.abort();
    return { candidate, summary };
  });
  const pending = loadRecoveryHint({
    sessionManager: {
      getRecoveryHintAsync,
    },
    preferredProjectRoot: "/workspace",
    signal: controller.signal,
    generation: () => "generation",
  });

  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
});

it("keeps a blocked result instead of manufacturing a candidate", async () => {
  const blocked = {
    sessionId: "sess_blocked",
    reason: "continuation-evidence-missing" as const,
    detail: "The session cannot be continued safely.",
    recoveryHint: "Start a fresh session.",
  };
  const getRecoveryHintAsync = vi.fn(async () => ({ blocked }));
  const result = await loadRecoveryHint({
    sessionManager: { getRecoveryHintAsync },
    preferredProjectRoot: "/workspace",
    generation: () => "generation",
  });

  expect(result).toEqual({ blocked });
});
