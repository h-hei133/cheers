import { expect, it, vi } from "vitest";
import type { Session, SessionReentrySummary } from "../../session/SessionManager.js";
import {
  createStartupRecoveryHint,
  loadRecoveryHint,
} from "./recoveryHint.js";

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

it("starts the startup scan once and publishes the result", async () => {
  const getRecoveryHintAsync = vi.fn(async () => candidateHint);
  const publish = vi.fn();
  const hint = createStartupRecoveryHint({
    sessionManager: { getRecoveryHintAsync },
    preferredProjectRoot: "/workspace",
    currentSessionId: "sess_current",
    generation: () => "session:project:config",
    publish,
    logger: { warn: vi.fn() },
  });

  await Promise.all([hint.start(), hint.start()]);

  expect(getRecoveryHintAsync).toHaveBeenCalledOnce();
  expect(publish).toHaveBeenCalledWith(candidateHint);
});

it("does not start a suggestion after the user has taken over", async () => {
  const getRecoveryHintAsync = vi.fn(async () => candidateHint);
  const publish = vi.fn();
  const hint = createStartupRecoveryHint({
    sessionManager: { getRecoveryHintAsync },
    preferredProjectRoot: "/workspace",
    generation: () => "session:project:config",
    publish,
    logger: { warn: vi.fn() },
  });

  hint.noteUserIntent();
  await hint.start();

  expect(getRecoveryHintAsync).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

it("drops a late hint after user intent", async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const getRecoveryHintAsync = vi.fn(async () => {
    await gate;
    return candidateHint;
  });
  const publish = vi.fn();
  const hint = createStartupRecoveryHint({
    sessionManager: { getRecoveryHintAsync },
    preferredProjectRoot: "/workspace",
    generation: () => "session:project:config",
    publish,
    logger: { warn: vi.fn() },
  });

  const pending = hint.start();
  hint.noteUserIntent();
  release();
  await pending;

  expect(publish).not.toHaveBeenCalled();
});

it("drops a late hint after the selected session generation changes", async () => {
  let sessionId = "sess_current";
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const getRecoveryHintAsync = vi.fn(async () => {
    await gate;
    return candidateHint;
  });
  const publish = vi.fn();
  const hint = createStartupRecoveryHint({
    sessionManager: { getRecoveryHintAsync },
    preferredProjectRoot: "/workspace",
    currentSessionId: sessionId,
    generation: () => sessionId,
    publish,
    logger: { warn: vi.fn() },
  });

  const pending = hint.start();
  sessionId = "sess_selected";
  release();
  await pending;

  expect(publish).not.toHaveBeenCalled();
});

it("rechecks the generation immediately before publishing", async () => {
  let calls = 0;
  const publish = vi.fn();
  const hint = createStartupRecoveryHint({
    sessionManager: { getRecoveryHintAsync: vi.fn(async () => candidateHint) },
    preferredProjectRoot: "/workspace",
    generation: () => {
      calls += 1;
      return calls < 5 ? "stable" : "changed";
    },
    publish,
    logger: { warn: vi.fn() },
  });

  await hint.start();

  // loadRecoveryHint makes three generation checks after the wrapper captures
  // its starting value; the fifth call is the wrapper's publish-time recheck.
  expect(calls).toBe(5);
  expect(publish).not.toHaveBeenCalled();
});

it("keeps a failed scan advisory when the logger also throws", async () => {
  const hint = createStartupRecoveryHint({
    sessionManager: {
      getRecoveryHintAsync: vi.fn(async () => {
        throw new Error("scan failed");
      }),
    },
    preferredProjectRoot: "/workspace",
    generation: () => "stable",
    publish: vi.fn(),
    logger: {
      warn: vi.fn(() => {
        throw new Error("logger failed");
      }),
    },
  });

  await expect(hint.start()).resolves.toBeUndefined();
});
