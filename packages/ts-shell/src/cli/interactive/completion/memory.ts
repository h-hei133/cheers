import { isDeepStrictEqual } from "node:util";
import { DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE, getLatestCompactCheckpoint } from "../../../context/compact/checkpoint/compactLiveCheckpoint.js";
import { extractProjectMemoryCandidates } from "../../../memory/projectMemoryCandidateExtractor.js";
import { DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE, initialDecision } from "../../../memory/projectMemoryReviewState.js";
import { createProjectMemoryLocalStore } from "../../../memory/projectMemoryLocalStore.js";
import { projectMemoryRootFor } from "../../../memory/projectMemoryRoot.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
import type { Suggestion } from "../../../presentation/tui/chrome/suggestions.js";

export type MemoryCatalogKind = "record" | "invalidatable" | "candidate" | "approvable" | "approved";

export function memoryCatalogStore(projectRoot: string) {
  return createProjectMemoryLocalStore({ ref: { mode: "explicit-local", root: projectMemoryRootFor(projectRoot) } });
}

/** Queries and review mutations stay in command owners; candidates only expose stable IDs. */
export async function memoryCatalog(kind: MemoryCatalogKind, context: ShellRuntimeContext): Promise<readonly Suggestion[]> {
  if (kind === "record" || kind === "invalidatable") {
    const store = memoryCatalogStore(context.projectRoot);
    const result = await store.list({ includeInvalidated: kind === "record" });
    if (result.diagnostics?.length) throw new Error("Memory catalog unavailable");
    return result.records.map(record => ({ value: record.id, label: record.id,
      detail: `${record.candidateKind} · ${record.invalidatedAt ? "invalidated" : "active"}` }));
  }
  const scope = `session:${context.session.id}`;
  const latest = getLatestCompactCheckpoint(DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE, scope);
  const candidates = latest ? extractProjectMemoryCandidates({ compactPacket: latest.packet }) : [];
  const state = DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE.get(scope);
  return candidates.flatMap(candidate => {
    const existing = state.decisions.find(entry => entry.candidateId === candidate.candidateId && entry.decision !== "superseded" && isDeepStrictEqual(entry.candidate, candidate));
    const decision = existing?.decision ?? initialDecision(candidate);
    if (kind === "approved" && decision !== "approved") return [];
    if (kind === "approvable" && decision === "unsafe") return [];
    return [{ value: candidate.candidateId, label: candidate.candidateId, detail: `${candidate.candidateKind} · ${decision}` }];
  });
}
