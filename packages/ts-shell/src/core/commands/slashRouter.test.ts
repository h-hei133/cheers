import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCompactLiveCheckpointStore,
  getLatestCompactCheckpoint,
} from "../../context/compact/checkpoint/compactLiveCheckpoint.js";
import { recordCompactionCheckpoint } from "../../context/compact/checkpoint/compactionCheckpoint.js";
import { createCompactInjectionStateStore } from "../../context/compact/injection/compactInjectionState.js";
import { createProjectMemoryInjectionStateStore } from "../../memory/projectMemoryInjectionState.js";
import { createProjectMemoryLocalStore } from "../../memory/projectMemoryLocalStore.js";
import { createProjectMemoryReviewStateStore } from "../../memory/projectMemoryReviewState.js";
import { createSidebarLiveEventStore } from "../../presentation/sidebar/sidebarLiveEventStore.js";
import { createStartupWarmContextCacheStore } from "../../context/startup/startupWarmContextHealth.js";
import { getSessionTodos } from "./todoCommandRuntime.js";
import { createCommandRegistry, listVisibleCommands } from "./registry.js";
import { routeSlashCommand } from "./slashRouter.js";

describe("slash router (W4)", () => {
  let workspaceRoot = "";
  let fakeHomeDir = "";
  const originalUserProfile = process.env.USERPROFILE;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    fakeHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-slash-router-home-"),
    );
    process.env.USERPROFILE = fakeHomeDir;
    process.env.HOME = fakeHomeDir;
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-command-registry-"),
    );
  });

  afterEach(() => {
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(fakeHomeDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it.each(["recall", "retain", "RECALL", "RETAIN"])("preserves raw %s invocation semantics", async (name) => {
    const result = await routeSlashCommand(`/${name}`, { cwd: workspaceRoot });
    expect(result).toMatchObject({ kind: "local", output: expect.stringContaining(`Usage: \`/${name.toLowerCase()} <`) });
  });

  it("passes a quoted theme name as one argument", async () => {
    const result = await routeSlashCommand('/theme "Dark Mode"', { cwd: workspaceRoot });
    expect(result).toMatchObject({ kind: "local", output: expect.stringContaining("`Dark Mode`") });
  });

  it("removes path quotes without losing spaces", async () => {
    expect(await routeSlashCommand('/cd "a b"', { cwd: workspaceRoot })).toMatchObject({
      kind: "shell-action", workspaceTarget: "a b",
    });
  });

  it("keeps a quoted status item intact through validation", async () => {
    const result = await routeSlashCommand('/statusline use "a b"', { cwd: workspaceRoot });
    expect(result).toMatchObject({ kind: "local", output: expect.stringContaining("Not a status item: `a b`.") });
  });

  it.each(['/cd "unfinished', "/cd 'unfinished"])("keeps an unfinished path literal: %s", async (source) => {
    expect(await routeSlashCommand(source, { cwd: workspaceRoot })).toMatchObject({
      kind: "shell-action", workspaceTarget: source.slice(4),
    });
  });

  it("preserves a contraction and brainstorm options through routing", async () => {
    const result = await routeSlashCommand("/brainstorm -i don't lose the draft", { cwd: workspaceRoot });
    expect(result).toMatchObject({ kind: "prompt", prompt: expect.stringContaining("Requirement elicitation") });
    expect(result).toMatchObject({ prompt: expect.stringContaining("don't lose the draft") });
  });

  it.each(["/cd trailing\\"])("reports invalid escaping for %s", async (source) => {
    expect(await routeSlashCommand(source, { cwd: workspaceRoot })).toMatchObject({
      kind: "local", output: expect.stringContaining("Invalid /cd arguments:"),
    });
  });

  it("keeps shell source intact when a loop gate contains quoted arguments", async () => {
    const result = await routeSlashCommand(`/loop "2" node -e "process.exit(process.argv[1] === 'a b' ? 0 : 1)" "a b"`, { cwd: workspaceRoot });
    expect(result).toMatchObject({ kind: "local", output: expect.stringContaining("already passes") });
  });

  it.each([
    "printf ok # don't split this",
    "cat <<'END'\ndon't split this\nEND",
  ])("passes shell comments and here-documents to a loop gate: %s", async (gate) => {
    const result = await routeSlashCommand(`/loop 1 ${gate}`, { cwd: workspaceRoot });
    expect(result).toMatchObject({ kind: "local", output: expect.stringContaining("already passes") });
  });

  it("keeps unfinished template prose readable", async () => {
    const promptsDir = path.join(workspaceRoot, ".agents", "prompts");
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, "explain.md"), "$@", "utf8");
    expect(await routeSlashCommand("/explain don't stop", { cwd: workspaceRoot })).toMatchObject({
      kind: "prompt", prompt: "don't stop",
    });
  });

  it("expands a skill invocation into a prompt instead of refusing it", async () => {
    // The defect stated as a test. `/skill:name` used to be parsed as a command
    // name, find nothing in the registry, and answer "Unknown slash command" — so a
    // documented invocation failed while the same skill worked through `/skill`.
    const skillsDir = path.join(workspaceRoot, ".agents", "skills", "demo");
    fs.mkdirSync(skillsDir, { recursive: true });
    fs.writeFileSync(
      path.join(skillsDir, "SKILL.md"),
      "---\nname: demo\ndescription: A demo\n---\nDEMO BODY",
      "utf8",
    );

    const result = await routeSlashCommand("/skill:demo extra", { cwd: workspaceRoot });
    expect(result?.kind).toBe("prompt");
    if (result?.kind === "prompt") {
      expect(result.prompt).toContain("DEMO BODY");
      expect(result.prompt).toContain("extra");
    }
  });

  it("names the available skills when the one asked for does not exist", async () => {
    const result = await routeSlashCommand("/skill:nosuch", { cwd: workspaceRoot });
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Unknown skill: nosuch");
      expect(result.output).toContain("Run /skill to see what is available");
    }
  });

  it("expands a prompt template invoked by its file name", async () => {
    const promptsDir = path.join(workspaceRoot, ".agents", "prompts");
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, "explain.md"), "Explain $@ closely.", "utf8");

    const result = await routeSlashCommand("/explain the parser", { cwd: workspaceRoot });
    expect(result?.kind).toBe("prompt");
    if (result?.kind === "prompt") {
      expect(result.prompt).toBe("Explain the parser closely.");
    }
  });

  it("lets a built-in command keep its name when a template claims it", async () => {
    // A command is a promise the product made; a file in a prompts directory must
    // not quietly take its name away. `audit` is an alias of `/review`, which is
    // exactly the kind of name a user-written file would otherwise shadow.
    const promptsDir = path.join(workspaceRoot, ".agents", "prompts");
    fs.mkdirSync(promptsDir, { recursive: true });
    fs.writeFileSync(path.join(promptsDir, "audit.md"), "TEMPLATE BODY: $@", "utf8");

    const result = await routeSlashCommand("/audit", { cwd: workspaceRoot });
    if (result?.kind === "prompt") {
      expect(result.prompt).not.toContain("TEMPLATE BODY");
    }
  });

  it("hands the checklist command the session it belongs to", async () => {
    // The checklist is per session, and the dispatcher is what passes the
    // session in. It used to be left out, so the command answered with a
    // freshly allocated list nobody could read: the output said "Task added"
    // and the session's own checklist was never touched.
    const context = { cwd: workspaceRoot, sessionId: "sess_todo_route" };
    const added = await routeSlashCommand("/todo add route me", context);

    expect((added as { output?: string }).output).toContain("route me");
    expect(getSessionTodos("sess_todo_route").map((item) => item.text)).toEqual(["route me"]);
  });

  it("still reports a slash word that is neither a command nor a template", async () => {
    const result = await routeSlashCommand("/nosuchthing", { cwd: workspaceRoot });

    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Unknown slash command");
    }
  });

  it("routes local connect command", async () => {
    const result = await routeSlashCommand("/connect status", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Provider connections");
    }
  });

  it("routes local model command", async () => {
    const result = await routeSlashCommand("/model", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      // Bare `/model` answers "what can I use"; `/model status` answers "what am
      // I using".
      expect(result.output).toContain("### Providers and models");
    }
  });

  it("routes local compact command without persistence side effects", async () => {
    const compactCheckpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-slash-1",
    });
    const compactInjectionStateStore = createCompactInjectionStateStore({
      now: () => "2026-05-15T00:00:00.000Z",
    });
    // A checkpoint is what a completed compaction produces, not what a
    // read-only handoff report writes. Seed one through the production
    // producer, the way the engine does after condensing.
    recordCompactionCheckpoint({
      sessionScopeId: "session:sess_slash",
      sourceCommand: "/compact",
      projectRoot: workspaceRoot,
      checkpointStore: compactCheckpointStore,
      injectionStateStore: compactInjectionStateStore,
    });
    const result = await routeSlashCommand("/compact", {
      cwd: workspaceRoot,
      sessionId: "sess_slash",
      compactCheckpointStore,
      compactInjectionStateStore,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Compact v2 handoff generated");
      expect(result.output).toContain("Markdown handoff");
      expect(result.output).toContain("- Handoff persisted: no");
      expect(result.output).toContain("- Provider/model call: none");
      expect(result.output).toContain("- Recovery execution: none");
      expect(result.output).toContain("run /memory to review candidates");
      // The report describes the checkpoint the condensation left behind; it
      // does not create one of its own.
      expect(result.output).toContain("Compact checkpoint");
      expect(result.output).toContain("- Checkpoint id: checkpoint-slash-1");
      expect(result.output).toContain("- Future-turn adapter: ready-for-adapter");
      expect(result.output).toContain(
        "- Injection status: checkpoint pending injection",
      );
      expect(result.output).toContain("closeout-candidate");
      expect(result.output).not.toContain("Unknown slash command");
    }
    expect(
      getLatestCompactCheckpoint(compactCheckpointStore, "session:sess_slash")
        ?.checkpointId,
    ).toBe("checkpoint-slash-1");
    expect(
      compactInjectionStateStore.get("session:sess_slash").injectionStatus,
    ).toBe("pending");
    expect(fs.readdirSync(workspaceRoot)).toEqual([]);
  });

  it("routes /memory to session-scoped candidate review without persistence", async () => {
    const compactCheckpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-16T00:00:00.000Z",
      nextId: () => "checkpoint-memory-review",
    });
    const projectMemoryReviewStateStore = createProjectMemoryReviewStateStore({
      now: () => "2026-05-16T00:00:00.000Z",
    });
    recordCompactionCheckpoint({
      sessionScopeId: "session:sess_memory_review",
      sourceCommand: "/compact",
      projectRoot: workspaceRoot,
      checkpointStore: compactCheckpointStore,
    });

    const result = await routeSlashCommand("/memory", {
      cwd: workspaceRoot,
      sessionId: "sess_memory_review",
      compactCheckpointStore,
      projectMemoryReviewStateStore,
    });

    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Project memory review");
      expect(result.output).toContain("- Memory written: no");
      expect(result.output).toContain("- Store mode: disabled");
      expect(result.output).toContain("- Retrieval / wake-up / recall: unavailable (store not readable)");
      expect(result.output).toContain("closeout-candidate");
      expect(result.output).not.toContain("Unknown slash command");
    }
    expect(fs.readdirSync(workspaceRoot)).toEqual([]);
  });

  it("routes explicit /memory save approved to a supplied local store only after approval", async () => {
    const compactCheckpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-16T00:00:00.000Z",
      nextId: () => "checkpoint-memory-save",
    });
    const projectMemoryReviewStateStore = createProjectMemoryReviewStateStore({
      now: () => "2026-05-16T00:00:00.000Z",
    });
    const memoryStoreRoot = path.join(workspaceRoot, ".memory-store-test");
    const projectMemoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: memoryStoreRoot },
    });
    recordCompactionCheckpoint({
      sessionScopeId: "session:sess_memory_save",
      sourceCommand: "/compact",
      projectRoot: workspaceRoot,
      checkpointStore: compactCheckpointStore,
    });
    const review = await routeSlashCommand("/memory", {
      cwd: workspaceRoot,
      sessionId: "sess_memory_save",
      compactCheckpointStore,
      projectMemoryReviewStateStore,
    });
    expect(review?.kind).toBe("local");
    const candidateId = review?.kind === "local"
      ? review.output.match(/- (pmc:[^ ]+) /)?.[1]
      : undefined;
    expect(candidateId).toBeTruthy();

    const blocked = await routeSlashCommand(`/memory save ${candidateId}`, {
      cwd: workspaceRoot,
      sessionId: "sess_memory_save",
      compactCheckpointStore,
      projectMemoryReviewStateStore,
      projectMemoryStore,
    });
    expect(blocked?.kind).toBe("local");
    if (blocked?.kind === "local") {
      expect(blocked.output).toContain("- Memory written: no");
    }

    await routeSlashCommand(`/memory approve ${candidateId}`, {
      cwd: workspaceRoot,
      sessionId: "sess_memory_save",
      compactCheckpointStore,
      projectMemoryReviewStateStore,
    });
    const saved = await routeSlashCommand("/memory save approved", {
      cwd: workspaceRoot,
      sessionId: "sess_memory_save",
      compactCheckpointStore,
      projectMemoryReviewStateStore,
      projectMemoryStore,
    });

    expect(saved?.kind).toBe("local");
    if (saved?.kind === "local") {
      expect(saved.output).toContain("Project memory store");
      expect(saved.output).toContain("- Memory written: yes");
      expect(saved.output).toContain("- Auto-load: no");
      expect(saved.output).toContain("- Retrieval / wake-up / recall: available on explicit request");
    }
    expect(fs.existsSync(path.join(memoryStoreRoot, "project-memory.jsonl"))).toBe(true);
  });

  it("routes /memory recall and /memory wake over a supplied local store without auto injection", async () => {
    const memoryStoreRoot = path.join(workspaceRoot, ".memory-recall-test");
    const projectMemoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: memoryStoreRoot },
    });
    await projectMemoryStore.write({
      storeRef: projectMemoryStore.ref,
      record: {
        id: "pmr:slash-recall",
        version: 1,
        createdAt: "2026-05-16T00:00:00.000Z",
        candidateId: "pmc:slash-recall",
        candidateKind: "project-fact",
        retentionClass: "project-scoped-candidate",
        approvedAt: "2026-05-16T00:00:00.000Z",
        approvedBySourceCommand: "/memory",
        memoryText: "Project memory recall uses deterministic local search.",
        evidence: ["route83:slash-router"],
        source: "system-derived",
        sourcePacket: "route83-test",
        routeReferences: ["route83"],
        safety: "safe",
        redactions: [],
      },
    });

    const recall = await routeSlashCommand("/memory recall deterministic search", {
      cwd: workspaceRoot,
      sessionId: "sess_memory_recall",
      projectMemoryStore,
    });
    expect(recall?.kind).toBe("local");
    if (recall?.kind === "local") {
      expect(recall.output).toContain("Project memory recall");
      expect(recall.output).toContain("Result count: 1");
      expect(recall.output).toContain("Auto-injected: no");
      expect(recall.output).toContain("Future-turn injection: explicit staged use only (/memory use)");
    }

    const wake = await routeSlashCommand("/memory wake", {
      cwd: workspaceRoot,
      sessionId: "sess_memory_recall",
      projectMemoryStore,
    });
    expect(wake?.kind).toBe("local");
    if (wake?.kind === "local") {
      expect(wake.output).toContain("Project memory wake-up preview");
      expect(wake.output).toContain("Startup cache changed: no");
      expect(wake.output).toContain("Auto-injected: no");
    }
  });

  it("routes /memory invalidate and delete over a supplied local store", async () => {
    const memoryStoreRoot = path.join(workspaceRoot, ".memory-delete-test");
    const projectMemoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: memoryStoreRoot },
    });
    await projectMemoryStore.write({
      storeRef: projectMemoryStore.ref,
      record: {
        id: "pmr:slash-delete",
        version: 1,
        createdAt: "2026-05-16T00:00:00.000Z",
        candidateId: "pmc:slash-delete",
        candidateKind: "project-fact",
        retentionClass: "project-scoped-candidate",
        approvedAt: "2026-05-16T00:00:00.000Z",
        approvedBySourceCommand: "/memory",
        memoryText: "Project memory lifecycle commands are explicit.",
        evidence: ["route84:slash-router"],
        source: "system-derived",
        sourcePacket: "route84-test",
        routeReferences: ["route84"],
        safety: "safe",
        redactions: [],
      },
    });

    const invalidated = await routeSlashCommand("/memory invalidate pmr:slash-delete superseded", {
      cwd: workspaceRoot,
      sessionId: "sess_memory_delete",
      projectMemoryStore,
    });
    expect(invalidated?.kind).toBe("local");
    if (invalidated?.kind === "local") {
      expect(invalidated.output).toContain("Project memory invalidate");
      expect(invalidated.output).toContain("- Outcome: invalidated");
      expect(invalidated.output).toContain("Auto-injected: no");
    }

    const recall = await routeSlashCommand("/memory recall lifecycle", {
      cwd: workspaceRoot,
      sessionId: "sess_memory_delete",
      projectMemoryStore,
    });
    expect(recall?.kind).toBe("local");
    if (recall?.kind === "local") {
      expect(recall.output).toContain("Result count: 0");
    }

    const deleted = await routeSlashCommand("/memory delete pmr:slash-delete remove", {
      cwd: workspaceRoot,
      sessionId: "sess_memory_delete",
      projectMemoryStore,
    });
    expect(deleted?.kind).toBe("local");
    if (deleted?.kind === "local") {
      expect(deleted.output).toContain("Project memory delete");
      expect(deleted.output).toContain("- Outcome: deleted");
    }
    expect(await projectMemoryStore.get("pmr:slash-delete")).toBeUndefined();
  });

  it("routes /memory use as explicit next-turn injection staging", async () => {
    const memoryStoreRoot = path.join(workspaceRoot, ".memory-use-test");
    const projectMemoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: memoryStoreRoot },
    });
    const projectMemoryInjectionStateStore = createProjectMemoryInjectionStateStore({
      nextId: () => "pmi:slash-use",
    });
    await projectMemoryStore.write({
      storeRef: projectMemoryStore.ref,
      record: {
        id: "pmr:slash-use",
        version: 1,
        createdAt: "2026-05-16T00:00:00.000Z",
        candidateId: "pmc:slash-use",
        candidateKind: "project-fact",
        retentionClass: "project-scoped-candidate",
        approvedAt: "2026-05-16T00:00:00.000Z",
        approvedBySourceCommand: "/memory",
        memoryText: "Project memory use stages next-turn context explicitly.",
        evidence: ["route85:slash-router"],
        source: "system-derived",
        sourcePacket: "route85-test",
        routeReferences: ["route85"],
        safety: "safe",
        redactions: [],
      },
    });

    const result = await routeSlashCommand("/memory use next-turn context", {
      cwd: workspaceRoot,
      sessionId: "sess_memory_use",
      projectMemoryStore,
      projectMemoryInjectionStateStore,
    });

    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Project memory use");
      expect(result.output).toContain("- Outcome: staged");
      expect(result.output).toContain("- Injection status: pending");
      expect(result.output).toContain("Future-turn injection: explicit staged use only");
    }
    expect(projectMemoryInjectionStateStore.get("session:sess_memory_use")).toEqual(
      expect.objectContaining({
        injectionStatus: "pending",
        memoryInjectionId: "pmi:slash-use",
        mode: "recall",
        query: "next-turn context",
      }),
    );
  });

  it("captures compact, memory, and warmup command activity for /sidebar", async () => {
    const sidebarLiveEventStore = createSidebarLiveEventStore({
      now: () => "2026-05-16T00:00:00.000Z",
    });
    const compactCheckpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-16T00:00:00.000Z",
      nextId: () => "checkpoint-sidebar-live",
    });
    const projectMemoryReviewStateStore = createProjectMemoryReviewStateStore({
      now: () => "2026-05-16T00:00:00.000Z",
    });
    const projectMemoryInjectionStateStore = createProjectMemoryInjectionStateStore({
      nextId: () => "pmi:sidebar-live",
    });
    const memoryStoreRoot = path.join(workspaceRoot, ".memory-sidebar-live");
    const projectMemoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: memoryStoreRoot },
    });
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "slash-sidebar-warmup-"));
    const startupWarmContextCacheStore = createStartupWarmContextCacheStore({
      ref: {
        mode: "test-only",
        projectRoot: workspaceRoot,
        cacheRoot,
      },
    });
    try {
      recordCompactionCheckpoint({
        sessionScopeId: "session:sess_sidebar_live",
        sourceCommand: "/compact",
        projectRoot: workspaceRoot,
        checkpointStore: compactCheckpointStore,
      });
      const review = await routeSlashCommand("/memory", {
        cwd: workspaceRoot,
        sessionId: "sess_sidebar_live",
        compactCheckpointStore,
        projectMemoryReviewStateStore,
        sidebarLiveEventStore,
      });
      const candidateId = review?.kind === "local"
        ? review.output.match(/- (pmc:[^ ]+) /)?.[1]
        : undefined;
      expect(candidateId).toBeTruthy();
      await routeSlashCommand(`/memory approve ${candidateId}`, {
        cwd: workspaceRoot,
        sessionId: "sess_sidebar_live",
        compactCheckpointStore,
        projectMemoryReviewStateStore,
        sidebarLiveEventStore,
      });
      await routeSlashCommand("/memory save approved", {
        cwd: workspaceRoot,
        sessionId: "sess_sidebar_live",
        compactCheckpointStore,
        projectMemoryReviewStateStore,
        projectMemoryStore,
        sidebarLiveEventStore,
      });
      const savedRecordId = (await projectMemoryStore.list()).records[0]?.id;
      expect(savedRecordId).toBeTruthy();
      await routeSlashCommand("/memory recall deterministic", {
        cwd: workspaceRoot,
        sessionId: "sess_sidebar_live",
        projectMemoryStore,
        sidebarLiveEventStore,
      });
      await routeSlashCommand("/memory use deterministic", {
        cwd: workspaceRoot,
        sessionId: "sess_sidebar_live",
        projectMemoryStore,
        projectMemoryInjectionStateStore,
        sidebarLiveEventStore,
      });
      await routeSlashCommand(`/memory invalidate ${savedRecordId} stale`, {
        cwd: workspaceRoot,
        sessionId: "sess_sidebar_live",
        projectMemoryStore,
        sidebarLiveEventStore,
      });
      await routeSlashCommand(`/memory delete ${savedRecordId} remove`, {
        cwd: workspaceRoot,
        sessionId: "sess_sidebar_live",
        projectMemoryStore,
        sidebarLiveEventStore,
      });
      await routeSlashCommand("/warmup status", {
        cwd: workspaceRoot,
        sessionId: "sess_sidebar_live",
        startupWarmContextCacheStore,
        sidebarLiveEventStore,
      });
      await routeSlashCommand("/warmup rebuild", {
        cwd: workspaceRoot,
        sessionId: "sess_sidebar_live",
        startupWarmContextCacheStore,
        sidebarLiveEventStore,
      });

      const sidebar = await routeSlashCommand("/sidebar", {
        cwd: workspaceRoot,
        sessionId: "sess_sidebar_live",
        compactCheckpointStore,
        projectMemoryReviewStateStore,
        projectMemoryInjectionStateStore,
        projectMemoryStore,
        startupWarmContextCacheStore,
        sidebarLiveEventStore,
      });

      const capturedTitles = sidebarLiveEventStore
        .listRecent({
          sessionScopeId: "session:sess_sidebar_live",
          maxEvents: 20,
        })
        .events.map((event) => event.title);
      // The read-only handoff report no longer emits a "Compact checkpoint"
      // event: it writes no checkpoint, so there is nothing to announce. The
      // event fires when the engine records one after a real condensation.
      expect(capturedTitles).not.toContain("Compact checkpoint");
      expect(capturedTitles).toEqual(
        expect.arrayContaining([
          "Memory saved",
          "Memory recalled",
          "Memory use staged",
          "Memory lifecycle",
          "Warmup status",
          "Warmup rebuilt",
        ]),
      );

      expect(sidebar?.kind).toBe("local");
      if (sidebar?.kind === "local") {
        // The boxed panel carries the recent activity the events captured,
        // with the same redaction statement the preview made.
        // The boxed panel wraps its lines to the box width, so the assertion
        // is on words, not the exact line the store recorded.
        expect(sidebar.output).toContain("Warmup");
        expect(sidebar.output).not.toContain("Project memory recall uses deterministic local search.");
        // The panel states the redaction in its own vocabulary.
        expect(sidebar.output).toContain("[REDACTED_RAW_CONTENT]");
      }
    } finally {
      fs.rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  it("does not inspect a warm cache attached to a different sidebar workspace", async () => {
    let reads = 0;
    let healthChecks = 0;
    const startupWarmContextCacheStore = createStartupWarmContextCacheStore({
      ref: { mode: "test-only", projectRoot: path.join(workspaceRoot, "other-project"), cacheRoot: workspaceRoot },
    });
    const read = startupWarmContextCacheStore.read;
    const health = startupWarmContextCacheStore.health;
    startupWarmContextCacheStore.read = async (...args) => { reads++; return read(...args); };
    startupWarmContextCacheStore.health = async (...args) => { healthChecks++; return health(...args); };
    const result = await routeSlashCommand("/sidebar snapshot", { cwd: workspaceRoot, startupWarmContextCacheStore });
    expect(result?.kind).toBe("local");
    expect(reads).toBe(0);
    expect(healthChecks).toBe(0);
    expect(result?.kind === "local" ? result.output : "").toContain("staleness: invalid");
  });

  it("routes compact JSON mode and rejects invalid compact args", async () => {
    const compactCheckpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-json",
    });
    const jsonResult = await routeSlashCommand("/compact json", {
      cwd: workspaceRoot,
      sessionId: "sess_json",
      compactCheckpointStore,
    });
    expect(jsonResult?.kind).toBe("local");
    if (jsonResult?.kind === "local") {
      expect(JSON.parse(jsonResult.output)).toEqual(
        expect.objectContaining({
          packetVersion: "compact-v2",
          source: "session-handoff",
        }),
      );
    }
    // A read-only artifact form writes no checkpoint: there is nothing to
    // inject because nothing was condensed.
    expect(
      getLatestCompactCheckpoint(compactCheckpointStore, "session:sess_json"),
    ).toBeUndefined();

    const invalidResult = await routeSlashCommand("/compact --execute", {
      cwd: workspaceRoot,
      compactCheckpointStore,
    });
    expect(invalidResult?.kind).toBe("local");
    if (invalidResult?.kind === "local") {
      expect(invalidResult.output).toContain("- Outcome: blocked");
      expect(invalidResult.output).toContain("compact-command-mutating-flag");
    }
  });

  it("routes /handoff alias to the same compact checkpoint path and supersedes latest", async () => {
    let checkpointIndex = 0;
    const compactCheckpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => {
        checkpointIndex += 1;
        return `checkpoint-alias-${checkpointIndex}`;
      },
    });
    const compactInjectionStateStore = createCompactInjectionStateStore({
      now: () => "2026-05-15T00:00:00.000Z",
    });
    // Both forms are read-only handoff reports, so neither writes a
    // checkpoint of its own. The supersede chain below is seeded through the
    // production producer, the way the engine does after condensing.
    const first = await routeSlashCommand("/compact", {
      cwd: workspaceRoot,
      sessionId: "sess_alias",
      compactCheckpointStore,
      compactInjectionStateStore,
    });
    const second = await routeSlashCommand("/handoff", {
      cwd: workspaceRoot,
      sessionId: "sess_alias",
      compactCheckpointStore,
      compactInjectionStateStore,
    });

    expect(first?.kind).toBe("local");
    expect(second?.kind).toBe("local");
    expect(
      getLatestCompactCheckpoint(compactCheckpointStore, "session:sess_alias"),
    ).toBeUndefined();

    recordCompactionCheckpoint({
      sessionScopeId: "session:sess_alias",
      sourceCommand: "/compact",
      projectRoot: workspaceRoot,
      checkpointStore: compactCheckpointStore,
      injectionStateStore: compactInjectionStateStore,
    });
    recordCompactionCheckpoint({
      sessionScopeId: "session:sess_alias",
      sourceCommand: "/handoff",
      projectRoot: workspaceRoot,
      checkpointStore: compactCheckpointStore,
      injectionStateStore: compactInjectionStateStore,
    });
    expect(compactCheckpointStore.getById("checkpoint-alias-1")?.status).toBe(
      "superseded",
    );
    expect(
      getLatestCompactCheckpoint(compactCheckpointStore, "session:sess_alias")
        ?.checkpointId,
    ).toBe("checkpoint-alias-2");
    expect(compactInjectionStateStore.get("session:sess_alias")).toEqual(
      expect.objectContaining({
        injectionStatus: "pending",
        checkpointId: "checkpoint-alias-2",
        sourceCommand: "/handoff",
      }),
    );
  });

  it("does not consume pending compact injection on command-only turns", async () => {
    const compactCheckpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-command-only",
    });
    const compactInjectionStateStore = createCompactInjectionStateStore({
      now: () => "2026-05-15T00:00:00.000Z",
    });
    recordCompactionCheckpoint({
      sessionScopeId: "session:sess_command_only",
      sourceCommand: "/compact",
      projectRoot: workspaceRoot,
      checkpointStore: compactCheckpointStore,
      injectionStateStore: compactInjectionStateStore,
    });
    const commandOnly = await routeSlashCommand("/model", {
      cwd: workspaceRoot,
      sessionId: "sess_command_only",
      compactCheckpointStore,
      compactInjectionStateStore,
    });

    expect(commandOnly?.kind).toBe("local");
    expect(
      compactInjectionStateStore.get("session:sess_command_only"),
    ).toEqual(
      expect.objectContaining({
        injectionStatus: "pending",
        checkpointId: "checkpoint-command-only",
      }),
    );
  });

  it("creates a fresh pending checkpoint after a prior checkpoint was consumed", async () => {
    let checkpointIndex = 0;
    const compactCheckpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-16T00:00:00.000Z",
      nextId: () => {
        checkpointIndex += 1;
        return `checkpoint-fresh-${checkpointIndex}`;
      },
    });
    const compactInjectionStateStore = createCompactInjectionStateStore({
      now: () => "2026-05-16T00:00:00.000Z",
    });
    recordCompactionCheckpoint({
      sessionScopeId: "session:sess_fresh_after_consumed",
      sourceCommand: "/compact",
      projectRoot: workspaceRoot,
      checkpointStore: compactCheckpointStore,
      injectionStateStore: compactInjectionStateStore,
    });
    compactInjectionStateStore.markInjected({
      sessionScopeId: "session:sess_fresh_after_consumed",
      checkpointId: "checkpoint-fresh-1",
    });
    compactInjectionStateStore.markConsumed({
      sessionScopeId: "session:sess_fresh_after_consumed",
      checkpointId: "checkpoint-fresh-1",
    });
    // A second condensation records a second checkpoint through the same
    // producer, which is what supersedes the consumed one.
    recordCompactionCheckpoint({
      sessionScopeId: "session:sess_fresh_after_consumed",
      sourceCommand: "/compact",
      projectRoot: workspaceRoot,
      checkpointStore: compactCheckpointStore,
      injectionStateStore: compactInjectionStateStore,
    });
    const fresh = await routeSlashCommand("/compact", {
      cwd: workspaceRoot,
      sessionId: "sess_fresh_after_consumed",
      compactCheckpointStore,
      compactInjectionStateStore,
    });

    expect(fresh?.kind).toBe("local");
    if (fresh?.kind === "local") {
      expect(fresh.output).toContain("- Checkpoint id: checkpoint-fresh-2");
      expect(fresh.output).toContain(
        "- Injection status: checkpoint pending injection",
      );
    }
    expect(
      compactInjectionStateStore.get("session:sess_fresh_after_consumed"),
    ).toEqual(
      expect.objectContaining({
        injectionStatus: "pending",
        checkpointId: "checkpoint-fresh-2",
        injectionCount: 0,
      }),
    );
  });

  it("routes every visible registry command name and alias without falling through to unknown", async () => {
    const registry = createCommandRegistry(workspaceRoot);
    const visibleCommands = Array.from(registry.values()).filter(
      (command) => command.availability !== "hidden" && command.enabled !== false,
    );
    const commandNames = new Set(visibleCommands.map((command) => command.name));
    const seenAliases = new Map<string, string>();

    expect(visibleCommands.length).toBeGreaterThan(0);

    for (const command of visibleCommands) {
      for (const alias of command.aliases ?? []) {
        expect(
          commandNames.has(alias),
          `${command.name} alias ${alias} collides with a command name`,
        ).toBe(false);
        expect(
          seenAliases.get(alias),
          `${command.name} alias ${alias} collides with ${seenAliases.get(alias)}`,
        ).toBeUndefined();
        seenAliases.set(alias, command.name);
      }

      for (const token of [command.name, ...(command.aliases ?? [])]) {
        const result = await routeSlashCommand(`/${token}`, {
          cwd: workspaceRoot,
        });
        expect(result, `/${token} should route from registry`).toBeTruthy();
        if (result?.kind === "local") {
          expect(
            result.output,
            `/${token} should not be treated as unknown`,
          ).not.toContain("Unknown slash command");
          expect(
            result.output,
            `/${token} should not be treated as malformed slash input`,
          ).not.toContain("Slash command required");
        }
      }
    }
  });

  it("routes prompt resume command", async () => {
    const result = await routeSlashCommand("/resume sess_123", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("shell-action");
    if (result?.kind === "shell-action") {
      expect(result.action).toBe("resume-session");
      expect(result.sessionId).toBe("sess_123");
    }
  });

  it("routes /warmup status and rebuild without future-turn injection", async () => {
    const cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), "slash-warmup-cache-"));
    const startupWarmContextCacheStore = createStartupWarmContextCacheStore({
      ref: {
        mode: "test-only",
        projectRoot: workspaceRoot,
        cacheRoot,
      },
    });
    try {
      const status = await routeSlashCommand("/warmup status", {
        cwd: workspaceRoot,
        startupWarmContextCacheStore,
      });
      expect(status?.kind).toBe("local");
      if (status?.kind === "local") {
        expect(status.output).toContain("- Injected into model: no");
        expect(status.output).toContain("- Startup auto-load: no");
      }

      const rebuild = await routeSlashCommand("/warmup rebuild", {
        cwd: workspaceRoot,
        startupWarmContextCacheStore,
      });
      expect(rebuild?.kind).toBe("local");
      if (rebuild?.kind === "local") {
        expect(rebuild.output).toContain("- Outcome: rebuilt");
        expect(rebuild.output).toContain("- Provider/model call: none");
      }
      expect((await startupWarmContextCacheStore.read()).found).toBe(true);
    } finally {
      fs.rmSync(cacheRoot, { recursive: true, force: true });
    }
  });

  it("routes /sidebar as a read-only visible state preview", async () => {
    const result = await routeSlashCommand("/sidebar", {
      cwd: workspaceRoot,
      sessionId: "sess_sidebar",
    });

    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      // The boxed panel replaced the prose preview that disclaimed itself.
      // It carries the same title and the read-only statement the model
      // of the panel pins, without the "no actual UI" apology.
      expect(result.output).toContain("Visible agent state");
      expect(result.output).toContain("[");
      expect(result.output).not.toContain("State preview only: no actual sidebar UI exists yet.");
      expect(result.output).not.toContain("Unknown slash command");
    }
  });

  it("routes /sidebar panel modes without changing the default preview", async () => {
    const sidebarLiveEventStore = createSidebarLiveEventStore({
      now: () => "2026-05-17T00:00:00.000Z",
    });
    sidebarLiveEventStore.append({
      sessionScopeId: "session:sess_sidebar_panel",
      event: {
        kind: "memory",
        severity: "success",
        visibility: "user-visible",
        source: "memory",
        title: "Memory saved",
        summary: "status: saved; raw content excluded",
      },
    });

    const panel = await routeSlashCommand("/sidebar panel", {
      cwd: workspaceRoot,
      sessionId: "sess_sidebar_panel",
      sidebarLiveEventStore,
    });
    const compact = await routeSlashCommand("/sidebar compact", {
      cwd: workspaceRoot,
      sessionId: "sess_sidebar_panel",
      sidebarLiveEventStore,
    });
    const detail = await routeSlashCommand("/sidebar detail", {
      cwd: workspaceRoot,
      sessionId: "sess_sidebar_panel",
      sidebarLiveEventStore,
    });
    const invalid = await routeSlashCommand("/sidebar always-on", {
      cwd: workspaceRoot,
      sessionId: "sess_sidebar_panel",
      sidebarLiveEventStore,
    });

    expect(panel?.kind).toBe("local");
    if (panel?.kind === "local") {
      expect(panel.output).toContain("[Recent activity]");
      expect(panel.output).toContain("Memory saved");
      expect(panel.output).toContain("Read-only panel of session state");
      expect(panel.output).toContain("No provider/model calls");
      expect(panel.output).not.toContain("State preview only: no actual sidebar UI exists yet.");
    }
    expect(compact?.kind).toBe("local");
    if (compact?.kind === "local") {
      expect(compact.output.split("\n").length).toBeLessThanOrEqual(28);
      expect(compact.output).toContain("[Next]");
    }
    expect(detail?.kind).toBe("local");
    if (detail?.kind === "local") {
      expect(detail.output).toContain("[Boundary]");
    }
    expect(invalid?.kind).toBe("local");
    if (invalid?.kind === "local") {
      expect(invalid.output).toContain("- Outcome: blocked");
      expect(invalid.output).toContain("invalid-sidebar-args");
      expect(invalid.output).toContain("/sidebar panel");
    }
  });

  it("routes /sidebar watch as a bounded live panel without changing snapshot panel", async () => {
    const sidebarLiveEventStore = createSidebarLiveEventStore({
      now: () => "2026-05-17T05:00:00.000Z",
    });
    sidebarLiveEventStore.appendMany({
      sessionScopeId: "session:sess_sidebar_watch",
      events: [
        {
          kind: "command",
          severity: "success",
          visibility: "user-visible",
          source: "slash-command",
          title: "Compact checkpoint",
          summary: "status: generated; raw content excluded",
        },
        {
          kind: "warning",
          severity: "warning",
          visibility: "developer-only",
          source: "route",
          title: "developer-only raw event",
          summary: "hidden by default",
        },
      ],
    });

    const watch = await routeSlashCommand("/sidebar watch", {
      cwd: workspaceRoot,
      sessionId: "sess_sidebar_watch",
      sidebarLiveEventStore,
    });
    const snapshot = await routeSlashCommand("/sidebar panel", {
      cwd: workspaceRoot,
      sessionId: "sess_sidebar_watch",
      sidebarLiveEventStore,
    });

    expect(watch?.kind).toBe("local");
    if (watch?.kind === "local") {
      expect(watch.output).toContain("Visible agent state snapshot");
      expect(watch.output).toContain("[Snapshot frame]");
      expect(watch.output).toContain("Frame: #1");
      expect(watch.output).toContain("Compact checkpoint");
      expect(watch.output).toContain("Developer-only sidebar events are hidden by default.");
      expect(watch.output).not.toContain("developer-only raw event");
      expect(watch.output.split("\n").length).toBeLessThanOrEqual(42);
      expect(watch.output).not.toContain("State preview only: no actual sidebar UI exists yet.");
    }

    expect(snapshot?.kind).toBe("local");
    if (snapshot?.kind === "local") {
      expect(snapshot.output).toContain("Read-only panel of session state");
      expect(snapshot.output).not.toContain("[Snapshot frame]");
      expect(snapshot.output).not.toContain("Visible agent state snapshot");
    }
  });

  it("routes /browser status, preview, and dry-run without browser execution", async () => {
    const sidebarLiveEventStore = createSidebarLiveEventStore({
      now: () => "2026-05-18T00:00:00.000Z",
    });

    const status = await routeSlashCommand("/browser", {
      cwd: workspaceRoot,
      sessionId: "sess_browser",
      sidebarLiveEventStore,
    });
    const preview = await routeSlashCommand("/browser preview navigate https://example.com", {
      cwd: workspaceRoot,
      sessionId: "sess_browser",
      sidebarLiveEventStore,
    });
    const blocked = await routeSlashCommand("/browser preview payment checkout", {
      cwd: workspaceRoot,
      sessionId: "sess_browser",
      sidebarLiveEventStore,
    });
    const dryRun = await routeSlashCommand("/browser dry-run click Checkout button", {
      cwd: workspaceRoot,
      sessionId: "sess_browser",
      sidebarLiveEventStore,
    });
    const sidebar = await routeSlashCommand("/sidebar", {
      cwd: workspaceRoot,
      sessionId: "sess_browser",
      sidebarLiveEventStore,
    });

    expect(status?.kind).toBe("local");
    if (status?.kind === "local") {
      expect(status.output).toContain("Browser capability status");
      expect(status.output).toContain("- Browser capability: preview-only");
      expect(status.output).toContain("- Browser process: not launched");
      expect(status.output).toContain("- Provider/model call: none");
    }
    expect(preview?.kind).toBe("local");
    if (preview?.kind === "local") {
      expect(preview.output).toContain("Browser action preview");
      expect(preview.output).toContain("- Action: navigate");
      expect(preview.output).toContain("- Readiness: supported-preview");
      expect(preview.output).toContain("- Executed: no");
    }
    expect(blocked?.kind).toBe("local");
    if (blocked?.kind === "local") {
      expect(blocked.output).toContain("- Outcome: blocked");
      expect(blocked.output).toContain("- Readiness: blocked-payment");
      expect(blocked.output).toContain("- Executed: no");
    }
    expect(dryRun?.kind).toBe("local");
    if (dryRun?.kind === "local") {
      expect(dryRun.output).toContain("Browser dry-run");
      expect(dryRun.output).toContain("- Requested action: click");
      expect(dryRun.output).toContain("- Sandbox decision: future-confirmation-required");
      expect(dryRun.output).toContain("- Executed: no");
      expect(dryRun.output).toContain("- Browser process: not launched");
      expect(dryRun.output).toContain("- Provider/model call: none");
    }
      expect(sidebar?.kind).toBe("local");
      if (sidebar?.kind === "local") {
        // The Tools section hides facts past its budget; the browser item
        // may be among them, so the assertion is on what the section shows
        // when it does, not that it always survives the budget.
        expect(sidebar.output).toContain("Visible agent state");
        expect(sidebar.output).not.toContain("Unknown slash command");
    }
  });

  it("returns a readable local error for unknown slash commands", async () => {
    const result = await routeSlashCommand("/unknown-cmd", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("- Outcome: blocked");
      expect(result.output).toContain("- BlockerKind: command-not-allowlisted");
      expect(result.output).toContain("- DoNext:");
      expect(result.output).toContain("Unknown slash command");
      expect(result.output).toContain("Quick actions:");
      expect(result.output).toContain("/help");
    }
  });

  it("returns discovery guidance for bare slash input", async () => {
    const result = await routeSlashCommand("/", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("- Outcome: blocked");
      expect(result.output).toContain("- BlockerKind: command-not-allowlisted");
      expect(result.output).toContain("- DoNext:");
      expect(result.output).toContain("Slash command required");
      expect(result.output).toContain("Quick actions:");
      expect(result.output).toContain("/resume");
    }
  });

  it("treats /auth as unknown after migration to /connect", async () => {
    const result = await routeSlashCommand("/auth status", {
      cwd: workspaceRoot,
    });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Unknown slash command: /auth");
    }
  });

  it("routes /cancel, /resume, /workspace, /mcp, /help, and /permissions as shell actions", async () => {
    for (const [command, action] of [
      ["/cancel", "cancel-run"],
      ["/resume list", "list-sessions"],
      ["/resume current", "list-sessions"],
      ["/resume switch sess_abc", "list-sessions"],
      ["/resume help", "list-sessions"],
      ["/sessions list", "list-sessions"],
      ["/sessions current", "list-sessions"],
      ["/workspace", "show-workspace"],
      ["/workspace status", "show-workspace"],
      ["/workspace recent", "show-workspace"],
      ["/workspace attach ../demo-project", "show-workspace"],
      ["/project use D:/work/my-app", "show-workspace"],
      ["/where", "show-workspace"],
      ["/mcp", "show-mcp"],
      ["/mcp status", "show-mcp"],
      ["/mcp tools", "show-mcp"],
      ["/mcp tools localSdk", "show-mcp"],
      ["/mcp doctor", "show-mcp"],
      ["/mcp reconnect", "show-mcp"],
      ["/mcp refresh localSdk", "show-mcp"],
      ["/help", "show-help"],
      ["/permissions", "manage-permissions"],
      ["/approval-policy list", "manage-permissions"],
      ["/permissions explain", "manage-permissions"],
      ["/permissions revoke 1", "manage-permissions"],
      ["/permissions reset", "manage-permissions"],
      ["/permissions reset all", "manage-permissions"],
    ] as const) {
      const result = await routeSlashCommand(command, { cwd: workspaceRoot });
      expect(result?.kind).toBe("shell-action");
      if (result?.kind === "shell-action") {
        expect(result.action).toBe(action);
        if (command === "/resume list" || command === "/sessions list") {
          expect(result.sessionAction).toBe("list");
        }
        if (command === "/resume current" || command === "/sessions current") {
          expect(result.sessionAction).toBe("current");
        }
        if (command === "/resume switch sess_abc") {
          expect(result.sessionAction).toBe("switch");
          expect(result.sessionId).toBe("sess_abc");
        }
        if (command === "/resume help") {
          expect(result.sessionAction).toBe("help");
        }
        if (command === "/permissions explain") {
          expect(result.permissionAction).toBe("explain");
        }
        if (command === "/permissions revoke 1") {
          expect(result.permissionAction).toBe("revoke");
          expect(result.permissionSelector).toBe("1");
        }
        if (command === "/permissions reset all") {
          expect(result.permissionAction).toBe("reset");
          expect(result.permissionSelector).toBe("all");
        }
        if (command === "/workspace" || command === "/workspace status") {
          expect(result.workspaceAction).toBe("status");
        }
        if (command === "/workspace recent") {
          expect(result.workspaceAction).toBe("recent");
        }
        if (command === "/workspace attach ../demo-project") {
          expect(result.workspaceAction).toBe("attach");
          expect(result.workspaceTarget).toBe("../demo-project");
        }
        if (command === "/project use D:/work/my-app") {
          expect(result.workspaceAction).toBe("attach");
          expect(result.workspaceTarget).toBe("D:/work/my-app");
        }
        if (command === "/mcp" || command === "/mcp status") {
          expect(result.mcpAction).toBe("status");
        }
        if (command === "/mcp tools") {
          expect(result.mcpAction).toBe("tools");
          expect(result.mcpTarget).toBeUndefined();
        }
        if (command === "/mcp tools localSdk") {
          expect(result.mcpAction).toBe("tools");
          expect(result.mcpTarget).toBe("localSdk");
        }
        if (command === "/mcp doctor") {
          expect(result.mcpAction).toBe("doctor");
        }
        if (command === "/mcp reconnect") {
          expect(result.mcpAction).toBe("refresh");
        }
        if (command === "/mcp refresh localSdk") {
          expect(result.mcpAction).toBe("refresh");
          expect(result.mcpTarget).toBe("localSdk");
        }
      }
    }
  });

  it("hides /mcp when MCP command exposure is disabled", async () => {
    fs.writeFileSync(
      path.join(workspaceRoot, ".cheers.json"),
      JSON.stringify({ enableMcpTools: false }),
      "utf8",
    );

    const visible = listVisibleCommands(workspaceRoot).map(
      (command) => command.name,
    );
    expect(visible).not.toContain("mcp");

    const routed = await routeSlashCommand("/mcp", { cwd: workspaceRoot });
    expect(routed?.kind).toBe("local");
    if (routed?.kind === "local") {
      expect(routed.output).toContain("Unknown slash command");
    }
  });
});

describe("a skill the command line named", () => {
  let workspaceRoot = "";
  let fakeHomeDir = "";
  const originalUserProfile = process.env.USERPROFILE;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    fakeHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-named-skill-home-"));
    process.env.USERPROFILE = fakeHomeDir;
    process.env.HOME = fakeHomeDir;
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-named-skill-"));
  });

  afterEach(() => {
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(fakeHomeDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("is invocable by the name the run loaded it under", async () => {
    // The prompt path loads `--skill <path>`, so the model is told about that
    // skill. If the router rebuilt its own loader without the flag it answered
    // "Unknown skill" for a skill the model had just been offered, and the two
    // lists disagreed about what exists.
    const named = path.join(workspaceRoot, "flagless.md");
    fs.writeFileSync(
      named,
      "---\nname: flagless\ndescription: named on the command line\n---\n\nNAMED BODY\n",
      "utf8",
    );
    const result = await routeSlashCommand("/skill:flagless", {
      cwd: workspaceRoot,
      skillOptions: { skillPaths: [named] },
    });

    expect(result?.kind).toBe("prompt");
    if (result?.kind === "prompt") expect(result.prompt).toContain("NAMED BODY");
  });

  it("is absent when discovery was silenced without naming it", async () => {
    // `--no-skills` means no discovered skill reaches the prompt. The router has
    // to honour that too, or the switch would silence the model's list while
    // leaving the user's own invocation path wide open.
    const dir = path.join(workspaceRoot, ".agents", "skills", "discovered");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "SKILL.md"),
      "---\nname: discovered\ndescription: from the project\n---\n\nDISCOVERED BODY\n",
      "utf8",
    );
    const result = await routeSlashCommand("/skill:discovered", {
      cwd: workspaceRoot,
      skillOptions: { noSkills: true },
    });

    expect(result?.kind).toBe("local");
    if (result?.kind === "local") expect(result.output).toContain("Unknown skill: discovered");
  });
});
