import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionManager } from "../SessionManager.js";

describe("selected branch recovery", () => {
  let home: string | undefined;
  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "branch-recovery-"));
    vi.stubEnv("HOME", home);
    vi.stubEnv("USERPROFILE", home);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    if (home) fs.rmSync(home, { recursive: true, force: true });
  });

  it.each(["", "  \n"])("keeps a source-bound image-only pending prompt %j across close and branch changes", async prompt => {
    const manager = new SessionManager(), session = manager.createNew();
    manager.addTurn(session.id, { role: "user", content: "base" });
    const base = manager.getSession(session.id)!.turns.at(-1)!.id!;
    const image = { type: "image" as const, data: "aGVsbG8=", mimeType: "image/png" };
    manager.persistUserPromptBarrier(session.id, prompt, undefined, [image]);
    const pending = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.saveInterrupted(session.id, "prompt");
    const reopened = new SessionManager();
    expect(reopened.getRecoverySnapshot(session.id)).toMatchObject({ pendingPrompt: prompt, interruptedKind: "prompt",
      lastUserMessage: { id: pending, content: [{ type: "text", text: prompt }, image] } });
    expect(reopened.describeSessionReentry(session.id).autoResumeReady).toBe(true);
    await reopened.revertTo(session.id, base);
    expect(reopened.getRecoverySnapshot(session.id).pendingPrompt).toBeUndefined();
    expect(JSON.stringify(reopened.getReplayPlan(session.id).replayMessages)).not.toContain(image.data);
    await reopened.revertTo(session.id, pending);
    expect(new SessionManager().getRecoverySnapshot(session.id).pendingPrompt).toBe(prompt);
  });

  it("does not turn an empty text-only prompt into image recovery", () => {
    const manager = new SessionManager(), session = manager.createNew();
    manager.persistUserPromptBarrier(session.id, "", undefined, []);
    manager.saveInterrupted(session.id);
    expect(manager.getRecoverySnapshot(session.id).pendingPrompt).toBeUndefined();
    expect(manager.describeSessionReentry(session.id).autoResumeReady).toBe(false);
  });

  it.each(["missing", "duplicate", "empty-image", "changed-text", "changed-role", "legacy-source"])("refuses image-only recovery after %s", kind => {
    const manager = new SessionManager(), session = manager.createNew();
    manager.persistUserPromptBarrier(session.id, "", undefined, [{ type: "image", data: "aGVsbG8=", mimeType: "image/png" }]);
    const pending = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.saveInterrupted(session.id);
    const directory = manager.getSessionDirPath(session.id), transcriptPath = path.join(directory, "transcript.jsonl");
    const events = fs.readFileSync(transcriptPath, "utf8").trimEnd().split("\n").map(line => JSON.parse(line));
    const message = events.find(event => event.type === "message" && event.id === pending)!;
    if (kind === "missing") events.splice(events.indexOf(message), 1);
    if (kind === "duplicate") events.push(message);
    if (kind === "empty-image") message.content[1].data = "";
    if (kind === "changed-text") message.content[0].text = "other request";
    if (kind === "changed-role") message.role = "assistant";
    fs.writeFileSync(transcriptPath, events.map(event => JSON.stringify(event)).join("\n") + "\n");
    if (kind === "legacy-source") {
      const statePath = path.join(directory, "state.json"), state = JSON.parse(fs.readFileSync(statePath, "utf8"));
      delete state.pendingPromptEntryId; fs.writeFileSync(statePath, JSON.stringify(state));
    }
    const reopened = new SessionManager();
    expect(reopened.getRecoverySnapshot(session.id).pendingPrompt).toBeUndefined();
    expect(reopened.describeSessionReentry(session.id).autoResumeReady).toBe(false);
  });

  it("does not automatically resume an interrupted prompt discarded by a branch switch", async () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    manager.addTurn(session.id, { role: "user", content: "selected request" });
    manager.addTurn(session.id, { role: "assistant", content: "selected answer" });
    const selectedId = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.persistUserPromptBarrier(session.id, "abandoned pending request");
    manager.markTurnActive(session.id);
    manager.saveInterrupted(session.id, "turn");
    await manager.revertTo(session.id, selectedId);

    const reopened = new SessionManager();
    expect(reopened.getRecoverySnapshot(session.id).pendingPrompt).toBeUndefined();
    expect(reopened.describeSessionReentry(session.id).autoResumeReady).toBe(false);
    expect(reopened.getSuggestedRecoverySession()?.id).toBe(session.id);
    expect(reopened.getSuggestedRecoverySession({ preferredProjectRoot: session.projectRoot })?.id).toBe(session.id);
    expect(JSON.stringify(reopened.getReplayPlan(session.id).replayMessages)).not.toContain("abandoned pending request");
  });

  it("automatically recovers a new interrupted prompt after branching", async () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    manager.addTurn(session.id, { role: "user", content: "original" });
    const originalId = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.addTurn(session.id, { role: "assistant", content: "discarded answer" });
    await manager.revertTo(session.id, originalId);
    manager.persistUserPromptBarrier(session.id, "selected pending request");
    manager.markTurnActive(session.id);
    manager.saveInterrupted(session.id, "turn");
    const reopened = new SessionManager();
    expect(reopened.getRecoverySnapshot(session.id)).toMatchObject({ pendingPrompt: "selected pending request", interruptedKind: "turn" });
    expect(reopened.describeSessionReentry(session.id).autoResumeReady).toBe(true);
  });

  it("recovers the same pending prompt when its branch is selected again", async () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    manager.addTurn(session.id, { role: "user", content: "base" });
    const base = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.persistUserPromptBarrier(session.id, "return to this prompt");
    const pending = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.markTurnActive(session.id);
    manager.saveInterrupted(session.id, "turn");
    await manager.revertTo(session.id, base);
    expect(manager.getRecoverySnapshot(session.id).pendingPrompt).toBeUndefined();
    await manager.revertTo(session.id, pending);
    const reopened = new SessionManager();
    expect(reopened.getRecoverySnapshot(session.id).pendingPrompt).toBe("return to this prompt");
    expect(reopened.describeSessionReentry(session.id).autoResumeReady).toBe(true);
  });

  it("clears the source when a legacy run replaces the prompt", () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    manager.persistUserPromptBarrier(session.id, "identified");
    const statePath = path.join(manager.getSessionDirPath(session.id), "state.json");
    expect(JSON.parse(fs.readFileSync(statePath, "utf8")).pendingPromptEntryId).toBeTruthy();
    manager.markRunStarted(session.id, "legacy replacement");
    expect(JSON.parse(fs.readFileSync(statePath, "utf8")).pendingPromptEntryId).toBeUndefined();
    manager.saveInterrupted(session.id);
    expect(manager.getRecoverySnapshot(session.id).pendingPrompt).toBe("legacy replacement");
  });

  it("shares a repaired selected prompt with continuity after branching", async () => {
    const manager = new SessionManager();
    const session = manager.createNew();
    manager.addTurn(session.id, { role: "user", content: "base" });
    const base = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.addTurn(session.id, { role: "assistant", content: "discarded answer" });
    await manager.revertTo(session.id, base);
    manager.persistUserPromptBarrier(session.id, "selected missing prompt");
    const pending = manager.getSession(session.id)!.turns.at(-1)!.id!;
    manager.saveInterrupted(session.id);
    const transcriptPath = path.join(manager.getSessionDirPath(session.id), "transcript.jsonl");
    const lines = fs.readFileSync(transcriptPath, "utf8").trimEnd().split("\n");
    fs.writeFileSync(transcriptPath, lines.filter(line => JSON.parse(line).id !== pending).join("\n") + "\n");
    const reopened = new SessionManager();
    expect(reopened.getRecoverySnapshot(session.id).pendingPrompt).toBe("selected missing prompt");
    expect(reopened.buildContinuitySnapshot(session.id).lastUserIntent).toBe("selected missing prompt");
  });

  it.each(["completed", "error", "terminated"])("clears pending source on %s", (terminal) => {
    const manager = new SessionManager();
    const session = manager.createNew();
    manager.persistUserPromptBarrier(session.id, "pending");
    if (terminal === "completed") manager.saveCompleted(session.id);
    else if (terminal === "error") manager.saveError(session.id, "failed");
    else manager.saveTerminated(session.id);
    const state = JSON.parse(fs.readFileSync(path.join(manager.getSessionDirPath(session.id), "state.json"), "utf8"));
    expect(state.pendingPrompt).toBeUndefined();
    expect(state.pendingPromptEntryId).toBeUndefined();
  });
});
