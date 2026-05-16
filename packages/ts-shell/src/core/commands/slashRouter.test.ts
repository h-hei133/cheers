import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createCompactLiveCheckpointStore,
  getLatestCompactCheckpoint,
} from "../context/compactLiveCheckpoint.js";
import { createCompactInjectionStateStore } from "../context/compactInjectionState.js";
import { createProjectMemoryInjectionStateStore } from "../context/projectMemoryInjectionState.js";
import { createProjectMemoryLocalStore } from "../context/projectMemoryLocalStore.js";
import { createProjectMemoryReviewStateStore } from "../context/projectMemoryReviewState.js";
import { createCommandRegistry, listVisibleCommands } from "./registry.js";
import { routeSlashCommand } from "./slashRouter.js";

describe("slash router (W4)", () => {
  let workspaceRoot = "";
  let fakeHomeDir = "";
  const originalUserProfile = process.env.USERPROFILE;
  const originalHome = process.env.HOME;

  beforeEach(() => {
    fakeHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-slash-router-home-"),
    );
    process.env.USERPROFILE = fakeHomeDir;
    process.env.HOME = fakeHomeDir;
    workspaceRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-command-registry-"),
    );
  });

  afterEach(() => {
    process.env.USERPROFILE = originalUserProfile;
    process.env.HOME = originalHome;
    fs.rmSync(fakeHomeDir, { recursive: true, force: true });
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("routes local doctor command", async () => {
    const result = await routeSlashCommand("/doctor", { cwd: workspaceRoot });
    expect(result).toBeTruthy();
    expect(result?.kind).toBe("local");
    if (result?.kind === "local") {
      expect(result.output).toContain("Private Coding Agents CLI Doctor");
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
      expect(result.output).toContain("Model selection status");
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
      expect(result.output).toContain("- Persistence: none");
      expect(result.output).toContain("- Provider/model call: none");
      expect(result.output).toContain("- Recovery execution: none");
      expect(result.output).toContain("run /memory to review candidates");
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
    await routeSlashCommand("/compact", {
      cwd: workspaceRoot,
      sessionId: "sess_memory_review",
      compactCheckpointStore,
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
      expect(result.output).toContain("- Persistence: not enabled");
      expect(result.output).toContain("- Retrieval / wake-up / recall: not enabled");
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
    await routeSlashCommand("/compact", {
      cwd: workspaceRoot,
      sessionId: "sess_memory_save",
      compactCheckpointStore,
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
      expect(saved.output).toContain("- Retrieval / wake-up / recall: not enabled");
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
      expect(recall.output).toContain("Future-turn injection: not enabled");
    }

    const wake = await routeSlashCommand("/memory wake", {
      cwd: workspaceRoot,
      sessionId: "sess_memory_recall",
      projectMemoryStore,
    });
    expect(wake?.kind).toBe("local");
    if (wake?.kind === "local") {
      expect(wake.output).toContain("Project memory wake-up preview");
      expect(wake.output).toContain("Startup cache: not enabled");
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
    expect(
      getLatestCompactCheckpoint(compactCheckpointStore, "session:sess_json")
        ?.checkpointId,
    ).toBe("checkpoint-json");

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
    if (second?.kind === "local") {
      expect(second.output).toContain("- Checkpoint id: checkpoint-alias-2");
      expect(second.output).toContain("- Source command: /handoff");
    }
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
    await routeSlashCommand("/compact", {
      cwd: workspaceRoot,
      sessionId: "sess_command_only",
      compactCheckpointStore,
      compactInjectionStateStore,
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
    await routeSlashCommand("/compact", {
      cwd: workspaceRoot,
      sessionId: "sess_fresh_after_consumed",
      compactCheckpointStore,
      compactInjectionStateStore,
    });
    compactInjectionStateStore.markInjected({
      sessionScopeId: "session:sess_fresh_after_consumed",
      checkpointId: "checkpoint-fresh-1",
    });
    compactInjectionStateStore.markConsumed({
      sessionScopeId: "session:sess_fresh_after_consumed",
      checkpointId: "checkpoint-fresh-1",
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
      expect(result.output).toContain("/sessions");
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

  it("routes /cancel, /sessions, /workspace, /mcp, /help, /view, and /permissions as shell actions", async () => {
    for (const [command, action] of [
      ["/cancel", "cancel-run"],
      ["/sessions", "list-sessions"],
      ["/sessions list", "list-sessions"],
      ["/sessions current", "list-sessions"],
      ["/sessions switch sess_abc", "list-sessions"],
      ["/sessions help", "list-sessions"],
      ["/sessions unknown-mode", "list-sessions"],
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
      ["/view", "show-view"],
      ["/view status", "show-view"],
      ["/view compact", "set-view"],
      ["/view user", "set-view"],
      ["/view verbose", "set-view"],
      ["/view developer", "set-view"],
      ["/view dev", "set-view"],
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
        if (command === "/sessions list") {
          expect(result.sessionAction).toBe("list");
        }
        if (command === "/sessions current") {
          expect(result.sessionAction).toBe("current");
        }
        if (command === "/sessions switch sess_abc") {
          expect(result.sessionAction).toBe("switch");
          expect(result.sessionId).toBe("sess_abc");
        }
        if (command === "/sessions help") {
          expect(result.sessionAction).toBe("help");
        }
        if (command === "/sessions unknown-mode") {
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
      path.join(workspaceRoot, ".private-agents.json"),
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
