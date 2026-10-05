import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { memoryCatalog } from "./memory.js";
import { catalogRequest, catalogSuggestions } from "./request.js";
import { DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE } from "../../../context/compact/checkpoint/compactLiveCheckpoint.js";
import * as extractor from "../../../memory/projectMemoryCandidateExtractor.js";
import { createProjectMemoryCandidate } from "../../../memory/projectMemoryCandidate.js";
import { DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE as review } from "../../../memory/projectMemoryReviewState.js";
import { createProjectMemoryLocalStore } from "../../../memory/projectMemoryLocalStore.js";
import { projectMemoryRootFor } from "../../../memory/projectMemoryRoot.js";
import type { ShellRuntimeContext } from "../../../core/shell/runtimeContext.js";
let root: string;
let context: ShellRuntimeContext;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(process.cwd(), ".tmp-memory-catalog-"));
  context = { cwd: root, projectRoot: root, session: { id: root } } as ShellRuntimeContext;
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
function request(text: string) { return catalogRequest({ text, cursor: text.length, revision: 1 }); }
it.each([["delete", "record"], ["invalidate", "invalidatable"], ["approve", "approvable"], ["reject", "candidate"], ["save", "approved"]])("resolves %s to its entity type", (action, kind) => {
  expect(request(`/memory ${action} `)?.kind).toBe(kind);
});
it.each(["/memory recall ", "/memory use ", "/memory add ", "/recall delete ", "/retain approve ", "/memory approve --all-safe ", "/memory save approved ", "/memory delete first reason"])("does not query for %s", text => { expect(request(text)).toBeUndefined(); });
it("lists record IDs without changing files and respects invalidation state", async () => {
  expect(await memoryCatalog("record", context)).toEqual([]);
  expect(fs.existsSync(projectMemoryRootFor(root))).toBe(false);
  const store = createProjectMemoryLocalStore({ ref: { mode: "test-only", root: projectMemoryRootFor(root) } });
  const record = { id: "pmr:fixture", version: 1 as const, createdAt: "2026-01-01T00:00:00Z", candidateId: "pmc:fixture", candidateKind: "project-fact" as const, retentionClass: "project-scoped-candidate" as const, approvedAt: "2026-01-01T00:00:00Z", approvedBySourceCommand: "/memory" as const, memoryText: "A fixture fact.", evidence: ["fixture"], source: "compact-packet" as const, routeReferences: [], safety: "safe" as const, redactions: [] };
  expect((await store.write({ record, storeRef: store.ref })).written).toBe(true);
  await store.invalidate!({ recordId: record.id, invalidatedAt: "2026-01-02T00:00:00Z", sourceCommand: "/memory" });
  const file = store.ref.recordsFile!; const bytes = fs.readFileSync(file); const mtime = fs.statSync(file).mtimeMs;
  expect((await memoryCatalog("record", context)).map(item => item.value)).toEqual([record.id]);
  expect(await memoryCatalog("invalidatable", context)).toEqual([]);
  expect(fs.readFileSync(file)).toEqual(bytes); expect(fs.statSync(file).mtimeMs).toBe(mtime);
  fs.appendFileSync(file, "{broken\n");
  await expect(memoryCatalog("record", context)).rejects.toThrow("unavailable");
});
it("projects latest candidates and approvals without updating review state", async () => {
  const scope = `session:${context.session.id}`;
  const safe = createProjectMemoryCandidate({ candidateKind: "project-fact", retentionClass: "project-scoped-candidate", confidence: "high", source: "compact-packet", summary: "Fixture fact", reason: "fixture", evidence: ["fixture"] });
  const unsafe = { ...safe, candidateId: "unsafe", safety: "unsafe" as const };
  const latest = vi.spyOn(DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE, "getLatest").mockReturnValue({ packet: {} } as never);
  const extract = vi.spyOn(extractor, "extractProjectMemoryCandidates").mockReturnValue([safe, unsafe]);
  review.updateCandidates({ reviewSessionId: scope, candidates: [safe, unsafe], sourceCommand: "/memory" });
  review.approve({ reviewSessionId: scope, candidateId: safe.candidateId, sourceCommand: "/memory" });
  const before = review.get(scope); const update = vi.spyOn(review, "updateCandidates");
  expect((await memoryCatalog("candidate", context)).map(item => item.value)).toEqual([safe.candidateId, "unsafe"]);
  expect((await memoryCatalog("approvable", context)).map(item => item.value)).toEqual([safe.candidateId]);
  expect((await memoryCatalog("approved", context)).map(item => item.value)).toEqual([safe.candidateId]);
  extract.mockReturnValue([{ ...safe, evidence: ["changed"] }]);
  expect(await memoryCatalog("approved", context)).toEqual([]);
  expect(update).not.toHaveBeenCalled(); expect(review.get(scope)).toBe(before);
  latest.mockReturnValue(undefined);
  expect(await memoryCatalog("candidate", context)).toEqual([]);
});

it("retains the explicit save-all selector alongside candidate IDs", () => {
  expect(catalogSuggestions(request("/memory save ")!, []).map(item => item.value)).toContain("approved");
});
