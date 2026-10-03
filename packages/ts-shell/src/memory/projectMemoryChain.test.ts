import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildCliCommandExecution } from "../entrypoints/cliCommandExecutionBridge.js";
import { routeSlashCommand } from "../core/commands/slashRouter.js";
import { ShellSessionRuntime } from "../core/shell/sessionRuntime.js";
import { buildPromptWithFutureTurnInjections } from "../core/shell/sessionFutureTurnProjection.js";
import { createProjectMemoryInjectionStateStore } from "../memory/projectMemoryInjectionState.js";
import { projectMemoryRootFor } from "../memory/projectMemoryRoot.js";
import type { ProjectMemoryRecord } from "../memory/projectMemoryStoreContract.js";

/**
 * The memory chain, driven through the production assembly.
 *
 * Both halves are here because the chain has two ends and the defect was that
 * neither was connected: `/memory save` had no store to write through, and the
 * turn-side planner had no store to read from, so a record could not be written
 * *or* injected.
 *
 * These call `buildCliCommandExecution` and `buildPromptWithFutureTurnInjections`
 * rather than building a `CommandContext` or a runtime by hand. A test that
 * assembles its own context passes whether or not the real assembly supplies
 * anything — the failure mode the phase-fourteen round already recorded once.
 */

function workspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "cheers-memory-"));
}

function approvedRecord(root: string, text: string): ProjectMemoryRecord {
  return {
    id: `pmr_${text.replace(/\W+/g, "_")}`,
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    candidateId: `pmc_${text.replace(/\W+/g, "_")}`,
    // A kind the wake preview reads. The selection is by kind and retention
    // class, so a fixture outside both lists would prove the store works and
    // say nothing about injection either way.
    candidateKind: "project-fact",
    retentionClass: "project-scoped-candidate",
    approvedAt: "2026-01-01T00:00:00.000Z",
    approvedBySourceCommand: "/memory",
    memoryText: text,
    evidence: ["test-fixture"],
    source: "compact-packet",
    routeReferences: [],
    safety: "safe",
    redactions: [],
  };
}

describe("the project memory chain", () => {
  it("gives /memory save a writable store through the real bridge", async () => {
    const root = workspace();
    const written: string[] = [];
    await buildCliCommandExecution(
      {
        prompt: "/memory status",
        cwd: root,
        renderer: {
          renderLine: (line: string) => written.push(line),
        } as never,
        printMode: true,
        interactive: false,
      },
      {
        routeSlashCommand: async (_input, context) => {
          // What the assembly actually handed to the command, read from the real
          // call rather than asserted about the code that builds it.
          const health = await context.projectMemoryStore?.health();
          written.push(`mode=${health?.mode} writable=${health?.writable} root=${health?.storeRoot}`);
          return { kind: "local", output: "" };
        },
      },
    );

    const line = written.find((entry) => entry.startsWith("mode="));
    expect(line).toBe(`mode=explicit-local writable=true root=${projectMemoryRootFor(root)}`);
  });

  it("writes a record that the router reads back from disk", async () => {
    // The command side, through the router, with the store the bridge supplies.
    const root = workspace();
    const storeRoot = projectMemoryRootFor(root);
    const store = (await storeFromBridge(root)).store;
    const record = approvedRecord(storeRoot, "this project uses conventional commits");

    const write = await store.write({ record, storeRef: store.ref });
    expect(write.written).toBe(true);

    // Read back through the same store the commands use, so this fails if the
    // path the writer chose and the path the reader chose ever diverge.
    const listed = await store.list();
    expect(listed.records.map((entry) => entry.memoryText)).toContain(
      "this project uses conventional commits",
    );

    // And on disk where a teammate would find it.
    const recordsFile = path.join(storeRoot, "project-memory.jsonl");
    expect(fs.existsSync(recordsFile)).toBe(true);
    expect(fs.readFileSync(recordsFile, "utf8")).toContain("conventional commits");
  });

  it("injects an approved record into the next prompt after /memory use", async () => {
    const root = workspace();
    const storeRoot = projectMemoryRootFor(root);
    const store = (await storeFromBridge(root)).store;
    await store.write({
      record: approvedRecord(storeRoot, "this project uses conventional commits"),
      storeRef: store.ref,
    });

    const injectionStateStore = createProjectMemoryInjectionStateStore();
    const sessionId = "sess_memory_chain";
    // `/memory use` with no query is the wake form: it stages the records that
    // exist rather than searching for one.
    const staged = await routeSlashCommand("/memory use", {
      cwd: root,
      projectRoot: root,
      sessionId,
      projectMemoryStore: store,
      projectMemoryInjectionStateStore: injectionStateStore,
    });
    expect(staged?.kind).toBe("local");

    const prompt = await buildPromptWithFutureTurnInjections({
      deps: { projectMemoryStore: store, projectMemoryInjectionStateStore: injectionStateStore },
      sessionId,
      prompt: "what should I do next?",
    });

    expect(prompt.prompt).toContain("<project_memory_context>");
    expect(prompt.prompt).toContain("conventional commits");
    expect(prompt.prompt).toContain("what should I do next?");
    expect(injectionStateStore.get(`session:${sessionId}`).injectionStatus).toBe("pending");
    prompt.accept();

    // Consumed, so the next turn does not repeat it: the mode is per-turn by
    // design, and a state left at pending would inject the same block again
    // without anyone asking.
    // Keyed by `session:<id>`, the same scope the command used to stage it.
    expect(injectionStateStore.get(`session:${sessionId}`).injectionStatus).toBe("consumed");
  });

  it("injects nothing when the assembly supplies no store", async () => {
    // The negative half: the assertion above must be about the wiring, not about
    // the planner always finding something to say.
    const injectionStateStore = createProjectMemoryInjectionStateStore();
    const sessionId = "sess_memory_absent";
    injectionStateStore.markPending({
      sessionScopeId: `session:${sessionId}`,
      sourceCommand: "/memory use",
      mode: "wake",
      recordIds: ["pmr_whatever"],
    });

    const prompt = await buildPromptWithFutureTurnInjections({
      deps: { projectMemoryInjectionStateStore: injectionStateStore },
      sessionId,
      prompt: "hello",
    });

    expect(prompt.prompt).toBe("hello");
    expect(injectionStateStore.get(`session:${sessionId}`).injectionStatus).toBe("pending");
    prompt.accept();
    expect(injectionStateStore.get(`session:${sessionId}`).injectionStatus).toBe("invalid");
  });
});

/** The store the bridge supplies, read through the bridge rather than rebuilt. */
async function storeFromBridge(root: string): Promise<{
  store: NonNullable<Parameters<typeof buildPromptWithFutureTurnInjections>[0]["deps"]["projectMemoryStore"]>;
}> {
  let captured: unknown;
  await buildCliCommandExecution(
    {
      prompt: "/memory status",
      cwd: root,
      renderer: { renderLine: () => {} } as never,
      printMode: true,
      interactive: false,
    },
    {
      routeSlashCommand: async (_input, context) => {
        captured = context.projectMemoryStore;
        return { kind: "local", output: "" };
      },
    },
  );
  if (!captured) throw new Error("the bridge supplied no project memory store");
  return { store: captured as never };
}

void ShellSessionRuntime;

describe("a memory store that cannot be written", () => {
  it("reports the refusal instead of failing the command", async () => {
    // A read-only checkout is a normal thing to work in, so this must be an
    // answer rather than an exception: the command prints why and the session
    // continues.
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-ro-"));
    const root = path.join(parent, "store");
    const store = (await storeFromBridge(root)).store;
    fs.chmodSync(parent, 0o500);
    try {
      const result = await store.write({
        record: approvedRecord(root, "unwritable"),
        storeRef: store.ref,
      });
      expect(result.written).toBe(false);
      expect(result.blocker).toContain("not writable");
    } finally {
      fs.chmodSync(parent, 0o700);
    }
  });

  it("refuses to store a secret-looking record", async () => {
    const root = workspace();
    const store = (await storeFromBridge(root)).store;
    const result = await store.write({
      record: approvedRecord(root, "api key is sk-abcdefghijklmnopqrstuvwxyz123456"),
      storeRef: store.ref,
    });

    expect(result.written).toBe(false);
    expect(result.blocker).toContain("secret-looking");
  });
});
