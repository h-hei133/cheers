import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CoreMcpGateway } from "./gateway.js";
import { runMcpShellAction } from "../commands/mcp/command.js";
import { runCliMcpCommand } from "../../entrypoints/cliMcpModule.js";
import { renderMcpContent } from "../../presentation/mcp/content.js";
import { runPromptInputStream } from "../../cli/runtime/inputStream.js";
import { tokenizeCommandArgs } from "../commands/arguments.js";

const server = path.resolve("src/core/mcp/fixtures/mockMcpServer.mjs");
let root: string;
let log: string;
const owners: CoreMcpGateway[] = [];
function configure(flags: string[] = [], extra = {}) {
  fs.writeFileSync(path.join(root, ".cheers.mcp.json"), JSON.stringify({ mcpServers: {
    local: { transport: "stdio", command: process.execPath, args: [server, "--log", log, ...flags], ...extra },
  } }));
}
function records() {
  return fs.existsSync(log) ? fs.readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map(line => JSON.parse(line)) : [];
}
function gateway(source: string | (() => string) = root, admission?: () => () => string | undefined) {
  const owner = new CoreMcpGateway(source, admission);
  owners.push(owner);
  return owner;
}
async function until(condition: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!condition() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  expect(condition()).toBe(true);
}
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-mcp-content-"));
  log = path.join(root, "protocol.jsonl");
  const home = path.join(root, "home");
  fs.mkdirSync(home);
  vi.stubEnv("HOME", home);
  vi.stubEnv("USERPROFILE", home);
});
afterEach(async () => {
  await Promise.all(owners.splice(0).map(owner => owner.close()));
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

describe("negotiated MCP resources, prompts and notifications", () => {
  it("reads complete paginated catalogs and content on one negotiated, tools-free connection", async () => {
    configure(["--content", "--no-tools", "--paginate"]);
    const owner = gateway();
    for (const action of ["resources", "templates", "prompts"] as const) {
      const response = await owner.content("local", { action });
      expect(response).toMatchObject({ serverName: "local", scope: "project", transport: "stdio", result: { kind: action, items: expect.any(Array) } });
      expect("items" in response.result && response.result.items.length).toBe(2);
    }
    const read = await owner.content("local", { action: "read", uri: "fixture://file/one" });
    expect(read.result).toMatchObject({ kind: "read", value: { contents: [{ uri: "fixture://file/one", text: expect.stringContaining("resource body") }, { blob: "AA==" }] } });
    const prompt = await owner.content("local", { action: "prompt", name: "second_prompt", arguments: { topic: "a subject" } });
    expect(prompt.result).toMatchObject({ kind: "prompt", value: { messages: [{ content: { text: "Discuss a subject" } }] } });
    expect(records().filter(item => item.event === "start")).toHaveLength(1);
    expect(records().some(item => item.event === "tools/list" || item.event === "tools/call")).toBe(false);
  });

  it("reports unadvertised capabilities without issuing protocol requests", async () => {
    configure();
    const owner = gateway();
    expect((await owner.content("local", { action: "resources" })).result).toEqual({ kind: "unsupported", capability: "resources" });
    expect((await owner.content("local", { action: "prompts" })).result).toEqual({ kind: "unsupported", capability: "prompts" });
    expect(records().some(item => /^(resources|prompts)\//.test(item.event))).toBe(false);
  });

  it("rejects repeated cursors, malformed catalogs and catalog invalidation before publishing", async () => {
    const owner = gateway();
    for (const flag of ["--repeat-cursor", "--malformed-content", "--notify-during-content"]) {
      configure(["--content", flag]);
      await expect(owner.content("local", { action: "resources" })).rejects.toMatchObject({ failureClass: "protocol" });
    }
  });

  it("validates required and unknown prompt arguments before prompts/get", async () => {
    configure(["--content"]);
    const owner = gateway();
    for (const request of [
      { action: "prompt" as const, name: "summarize" },
      { action: "prompt" as const, name: "summarize", arguments: { topic: "one", extra: "two" } },
      { action: "prompt" as const, name: "absent", arguments: { topic: "one" } },
    ]) await expect(owner.content("local", request)).rejects.toThrow();
    expect(records().some(item => item.event === "prompts/get")).toBe(false);
    expect(records().filter(item => item.event === "start")).toHaveLength(1);
    expect(owner.notifications()[0]?.state).toBe("live");
  });

  it("keeps unrelated catalogs and subscriptions live through resource updates", async () => {
    configure(["--content", "--notify-resource-during-content"]);
    const owner = gateway();
    await owner.content("local", { action: "subscribe", uri: "fixture://file/one" });
    expect((await owner.content("local", { action: "prompts" })).result.kind).toBe("prompts");
    expect((await owner.content("local", { action: "resources" })).result.kind).toBe("resources");
    await expect(owner.content("local", { action: "read", uri: "fixture://file/one" })).rejects.toThrow("content changed");
    expect(owner.notifications()[0]?.state).toBe("live");
    expect(records().filter(item => item.event === "start")).toHaveLength(1);
    expect((await owner.content("local", { action: "unsubscribe", uri: "fixture://file/one" })).result.kind).toBe("unsubscribe");
  });

  it("honors prelaunch cancellation before the stdio transport starts", async () => {
    configure(["--content"]);
    const owner = gateway();
    const release = owner.subscribe(() => owner.cancelContent());
    await expect(owner.content("local", { action: "resources" })).rejects.toMatchObject({ failureClass: "timeout-cancelled" });
    release();
    expect(records().some(item => item.event === "start")).toBe(false);
  });

  it("keeps notification inspection cold and bounds metadata without retaining remote secrets", async () => {
    configure(["--content"]);
    const owner = gateway();
    expect(owner.notifications()).toEqual([{ serverName: "local", state: "not-connected", entries: [], dropped: 0 }]);
    expect(records()).toEqual([]);
    await owner.content("local", { action: "subscribe", uri: "fixture://file/one" });
    await until(() => owner.notifications()[0]!.entries.some(item => item.method === "notifications/resources/updated"));
    const snapshot = owner.notifications()[0]!;
    expect(snapshot.entries).toHaveLength(200);
    expect(snapshot.dropped).toBe(6);
    expect(snapshot.entries.at(-1)?.sequence).toBe(206);
    expect(JSON.stringify(snapshot)).not.toContain("fixture-secret");
    expect(JSON.stringify(snapshot)).not.toContain("fixture://file/one");
    const before = records().length;
    owner.notifications();
    expect(records()).toHaveLength(before);
    await owner.content("local", { action: "unsubscribe", uri: "fixture://file/one" });
    configure(["--content"], { enabled: false });
    expect(owner.notifications()[0]).toMatchObject({ state: "not-connected", entries: [] });
    await expect(owner.content("local", { action: "read", uri: "fixture://file/one" })).rejects.toThrow();
  });

  it("rejects content from a changed workspace and does not replay the read", async () => {
    configure(["--content", "--delay-content"]);
    let current = root;
    const owner = gateway(() => current);
    const pending = owner.content("local", { action: "read", uri: "fixture://file/one" });
    await until(() => records().some(item => item.event === "resources/read"));
    current = path.join(root, "other");
    fs.mkdirSync(current);
    await expect(pending).rejects.toThrow("workspace changed");
    expect(records().filter(item => item.event === "resources/read")).toHaveLength(1);
    expect(owner.notifications()).toEqual([]);
  });

  it("rejects late content when configuration or safety admission changes", async () => {
    for (const change of ["config", "admission"] as const) {
      configure(["--content", "--delay-content"]);
      let refused = false;
      const owner = gateway(root, () => () => refused ? "Configuration blocked" : undefined);
      const count = records().filter(item => item.event === "resources/read").length;
      const pending = owner.content("local", { action: "read", uri: "fixture://file/one" });
      await until(() => records().filter(item => item.event === "resources/read").length > count);
      if (change === "config") configure(["--content"], { enabled: false });
      else refused = true;
      await expect(pending).rejects.toThrow();
      await owner.close();
    }
  });

  it("cancels an outstanding content request and never repeats it", async () => {
    configure(["--content", "--hang-content"]);
    const owner = gateway();
    const abort = new AbortController();
    const pending = owner.content("local", { action: "read", uri: "fixture://file/one" }, abort.signal);
    await until(() => records().some(item => item.event === "resources/read"));
    abort.abort();
    await expect(pending).rejects.toMatchObject({ failureClass: "timeout-cancelled" });
    expect(records().filter(item => item.event === "resources/read")).toHaveLength(1);
    expect(owner.notifications()[0]).toMatchObject({ state: "not-connected" });
  });

  it("cancels queued content before dispatch and allows a later explicit request", async () => {
    configure(["--content", "--hang-content"]);
    const owner = gateway();
    const first = owner.content("local", { action: "read", uri: "fixture://file/one" }).catch(error => error);
    await until(() => records().some(item => item.event === "resources/read"));
    const queued = owner.content("local", { action: "read", uri: "fixture://file/two" }).catch(error => error);
    owner.cancelContent();
    expect(await first).toBeInstanceOf(Error);
    expect(await queued).toBeInstanceOf(Error);
    expect(records().filter(item => item.event === "resources/read")).toHaveLength(1);
    configure(["--content"]);
    expect((await owner.content("local", { action: "read", uri: "fixture://file/later" })).result.kind).toBe("read");
    expect(records().filter(item => item.event === "resources/read")).toHaveLength(2);
  });

  it("cancels earlier host-queued reads in one pipe chunk while preserving ordinary and later explicit input", async () => {
    configure(["--content"]);
    const owner = gateway();
    const stdin = new PassThrough();
    const dispatched: string[] = [];
    const run = runPromptInputStream({ stdin,
      runtimeContext: { session: { id: "pipe", projectRoot: root }, projectRoot: root } as never,
      sessionRuntime: { waitForIdle: async () => {} } as never,
      renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never,
      runPrompt: async prompt => {
        dispatched.push(prompt);
        if (!prompt.startsWith("/mcp ")) return;
        const action = await runMcpShellAction(tokenizeCommandArgs(prompt.slice(5)), { cwd: root });
        if (action.kind !== "shell-action") throw new Error("Invalid fixture command");
        await runCliMcpCommand({ ...action, gateway: owner, renderer: { renderLine: () => {} } });
      },
    });
    stdin.end("/mcp read local fixture://file/cancelled\nordinary\n/mcp -- cancel\n/mcp read local fixture://file/later\n");
    await run;
    expect(dispatched).toEqual(["/mcp -- cancel", "ordinary", "/mcp read local fixture://file/later"]);
    expect(records().filter(item => item.event === "resources/read")).toHaveLength(1);
  });

  it("settles shutdown during connection initialization without treating cancellation as cleanup failure", async () => {
    configure(["--content"]);
    const owner = gateway();
    const pending = owner.content("local", { action: "read", uri: "fixture://file/one" }).catch(error => error);
    for (let step = 0; step < 6; step++) await Promise.resolve();
    await expect(owner.close()).resolves.toBeUndefined();
    expect(await pending).toBeInstanceOf(Error);
  });

  it("rejects oversized resource responses and sanitizes remote terminal output", async () => {
    configure(["--content", "--large-content"]);
    const owner = gateway();
    await expect(owner.content("local", { action: "read", uri: "fixture://file/one" })).rejects.toThrow("size limit");
    configure(["--content"]);
    const text = renderMcpContent(await owner.content("local", { action: "read", uri: "fixture://file/one" }));
    expect(text).toContain("resource body");
    expect(text).toContain("Binary resource omitted");
    expect(text).not.toMatch(/fixture-secret|\x1b|\x07/);
    expect(text).toContain("\\x1b]52");
    expect(text).toContain("Redacted content");
  });

  it("uses the same parsed command contract for actual reads and prompt previews", async () => {
    configure(["--content"]);
    const owner = gateway();
    const lines: string[] = [];
    for (const args of [["resources", "local"], ["read", "local", "fixture://file/one"], ["prompt", "local", "summarize", '{"topic":"a subject"}'], ["notifications", "local"]]) {
      const result = await runMcpShellAction(args, { cwd: root });
      expect(result.kind).toBe("shell-action");
      if (result.kind !== "shell-action") throw new Error("Missing shell action");
      await runCliMcpCommand({ ...result, gateway: owner, renderer: { renderLine: line => lines.push(line) } });
    }
    expect(lines.join("\n")).toContain("Prompt preview only");
    expect(lines.join("\n")).toContain("Discuss a subject");
    expect(lines.join("\n")).not.toContain("fixture-secret");
    for (const args of [["resources"], ["read", "local"], ["prompt", "local", "summarize", '{"topic":7}'], ["read", "local", "uri", "extra"]]) {
      expect(await runMcpShellAction(args, { cwd: root })).toMatchObject({ kind: "local", output: expect.stringContaining("Invalid") });
    }
    expect(records().some(item => item.event === "tools/call")).toBe(false);
  });

  it("redacts and neutralizes remote protocol errors through the actual CLI failure renderer", async () => {
    configure(["--content", "--content-error"]);
    const owner = gateway();
    const lines: string[] = [];
    await runCliMcpCommand({ gateway: owner, renderer: { renderLine: line => lines.push(line) },
      mcpAction: "content", mcpTarget: "local", mcpContent: { action: "read", uri: "fixture://file/one" } });
    const output = lines.join("\n");
    expect(output).toContain("Outcome: blocked");
    expect(output).toContain("Remote error");
    expect(output).not.toMatch(/\x1b|\x07|synthetic-password|synthetic-token|sk-syntheticReview12345/);
  });
});
