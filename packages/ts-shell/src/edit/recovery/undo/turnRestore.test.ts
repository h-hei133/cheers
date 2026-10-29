import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../../../core/commands/types.js";
import { hashContent } from "../../authority/content.js";
import { allocateOperation, captureOperationScope, withOperationStore } from "../operation/store.js";
import * as previewModule from "../operation/preview.js";
import * as restoreModule from "../operation/restore.js";
import { restoreTurn } from "./turnRestore.js";

/**
 * Restoring a whole turn.
 *
 * The order and the stopping rule are what this owns; the per-file restore is
 * covered by the operation tests. So the restore itself is replaced here, and
 * what is asserted is which operations were attempted, in what order, and what
 * happened to the ones after a step that did not verify.
 */

let directory: string;
let context: CommandContext;
beforeEach(() => {
  const scratch = path.join(os.tmpdir(), "cheers-test");
  fs.mkdirSync(scratch, { recursive: true });
  directory = fs.mkdtempSync(path.join(scratch, "turn-restore-"));
  context = { cwd: directory, sessionId: "turn-restore-session" };
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }); });

function seed(operationId: string, correlationId: string | undefined) {
  const scope = captureOperationScope({ sessionId: context.sessionId!, workspaceRoot: directory });
  withOperationStore(scope, () => {
    allocateOperation({
      ...scope, schemaVersion: 1, operationId, callId: `call-${operationId}`,
      ...(correlationId ? { correlationId } : {}), revision: 1, status: "committed", undo: "none",
      createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
      files: [{
        id: "file", workspace: scope.workspace, path: `${operationId}.txt`, kind: "update",
        before: { state: "exists", hash: hashContent("original\n") },
        after: { state: "exists", hash: hashContent("current\n") },
        snapshot: { authorityId: operationId, recordId: "file" }, status: "committed", undo: "none",
      }],
    });
  });
}

/** A preview that answers without touching the snapshot store. */
function stubPreview(canRestore: (operationId: string) => boolean = () => true) {
  return vi.spyOn(previewModule, "previewOperation").mockImplementation(async receipt => ({
    receipt,
    revision: `revision-${receipt.operationId}`,
    files: [],
    blockers: canRestore(receipt.operationId) ? [] : ["snapshot-or-workspace-unavailable"],
    canRestore: canRestore(receipt.operationId),
  }));
}

/** A restore whose outcome is decided per operation. */
function stubRestore(outcome: (operationId: string) => "restored-verified" | "partial" | "blocked" = () => "restored-verified") {
  return vi.spyOn(restoreModule, "restoreOperation").mockImplementation(async (preview, approval) => ({
    // The real path refuses without approval; the stub does too, so a batch
    // that forgot to confirm would show up here as success it did not have.
    status: approval === undefined ? "denied" : outcome(preview.receipt.operationId),
    operationId: preview.receipt.operationId,
    files: [{ path: `${preview.receipt.operationId}.txt`, status: "restored-verified" }],
  }));
}

const host = () => ({ context: () => context });

describe("restoring a turn", () => {
  it("walks the turn's operations newest first", async () => {
    seed("older", "prompt-1");
    seed("newer", "prompt-1");
    stubPreview();
    const restore = stubRestore();

    const outcome = await restoreTurn(host(), "prompt-1", true);

    expect(outcome.steps.map(step => step.operationId)).toEqual(["newer", "older"]);
    expect(restore.mock.calls.map(call => call[0].receipt.operationId)).toEqual(["newer", "older"]);
    expect(outcome.complete).toBe(true);
  });

  it("does not write without confirmation", async () => {
    seed("only", "prompt-1");
    stubPreview();
    const restore = stubRestore();

    const outcome = await restoreTurn(host(), "prompt-1", false);

    expect(outcome.steps.map(step => step.operationId)).toEqual(["only"]);
    expect(outcome.complete).toBe(false);
    // The approval argument is what gates the write; without it the restore
    // path refuses on its own, and the batch reports that rather than success.
    expect(restore.mock.calls[0]?.[1]).toBeUndefined();
  });

  it("says so when the turn has nothing outstanding", async () => {
    seed("only", "prompt-2");
    stubPreview(); stubRestore();

    const outcome = await restoreTurn(host(), "other-turn", true);

    expect(outcome.steps).toEqual([]);
    expect(outcome.stoppedBecause).toContain("No outstanding operation belongs to turn");
  });

  it("ignores operations that belong to another turn", async () => {
    seed("mine", "prompt-1");
    seed("theirs", "prompt-2");
    stubPreview(); stubRestore();

    const outcome = await restoreTurn(host(), "prompt-1", true);

    expect(outcome.steps.map(step => step.operationId)).toEqual(["mine"]);
  });

  it("stops at the first step that cannot be restored and names the rest", async () => {
    // Continuing past a failed step would restore older content over a file
    // the failure left in an unknown state.
    seed("older", "prompt-1");
    seed("newer", "prompt-1");
    stubPreview();
    stubRestore(operationId => operationId === "newer" ? "partial" : "restored-verified");

    const outcome = await restoreTurn(host(), "prompt-1", true);

    expect(outcome.steps.map(step => step.operationId)).toEqual(["newer"]);
    expect(outcome.skipped).toEqual(["older"]);
    expect(outcome.complete).toBe(false);
    expect(outcome.stoppedBecause).toContain("ended as partial");
  });

  it("stops before a step whose preview cannot be trusted", async () => {
    seed("older", "prompt-1");
    seed("newer", "prompt-1");
    stubPreview(operationId => operationId !== "newer");
    const restore = stubRestore();

    const outcome = await restoreTurn(host(), "prompt-1", true);

    expect(outcome.steps).toEqual([]);
    expect(outcome.skipped).toEqual(["newer", "older"]);
    expect(outcome.stoppedBecause).toContain("snapshot-or-workspace-unavailable");
    expect(restore).not.toHaveBeenCalled();
  });

  it("refuses to start while a run is in progress", async () => {
    seed("only", "prompt-1");
    stubPreview(); stubRestore();

    const outcome = await restoreTurn({ context: () => context, busy: () => true }, "prompt-1", true);

    expect(outcome.steps).toEqual([]);
    expect(outcome.stoppedBecause).toContain("run is in progress");
  });
});
