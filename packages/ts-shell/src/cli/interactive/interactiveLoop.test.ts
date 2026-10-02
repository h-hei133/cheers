import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { Interface as ReadlineInterface } from "node:readline";
import { describe, expect, it } from "vitest";

import { runInteractiveLoop } from "./interactiveLoop.js";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";

describe("interactive loop", () => {
  it("uses the full-screen host and its readline stand-in on a real terminal", async () => {
    const stdin = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.ReadStream;
    const stdout = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.WriteStream;
    const processEvents = new EventEmitter() as NodeJS.Process;
    let capturedReadline: ReadlineInterface | null = null;

    await runInteractiveLoop({
      stdin,
      stdout,
      process: processEvents,
      sessionManager: { sessionExists: () => false } as never,
      renderer: new StreamingRenderer(),
      runtimeContext: {
        cwd: "/tmp/project-alpha",
        projectRoot: "/tmp/project-alpha",
        session: { id: "sess_1234567890abcdef" },
        runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64000 },
        gitContext: { branch: "main" },
      } as never,
      sessionRuntime: {
        getAgentMode: () => "build",
      getPermissionScope: () => "ask",
        getCurrentRunController: () => null,
        observeEvents: () => () => undefined,
        terminate: () => undefined,
      } as never,
      logger: {
        error: () => undefined,
        info: () => undefined,
      } as never,
      approvalTrustPolicy: {} as never,
      initialMcpGateway: {} as never,
      setReadline: (readline) => {
        capturedReadline = readline;
      },
      setActiveNonInteractiveApprovalMode: () => undefined,
      exit: () => undefined,
    });

    // The host owns raw stdin, so downstream command routers get a readline
    // stand-in whose question() is answered from the host's own prompt.
    expect(capturedReadline).not.toBeNull();
    expect(typeof capturedReadline?.question).toBe("function");
    expect(typeof capturedReadline?.close).toBe("function");

    capturedReadline?.close();
    (stdin as unknown as PassThrough).destroy();
    (stdout as unknown as PassThrough).destroy();
  });

  it("falls back to the line-oriented loop when output is a pipe", async () => {
    // Over a pipe there is no window size and no cursor addressing, so the
    // full-screen host cannot render anything usable.
    const stdin = new PassThrough();
    const processEvents = new EventEmitter() as NodeJS.Process;
    let capturedReadline: ReadlineInterface | null = null;
    const loop = runInteractiveLoop({
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: new PassThrough() as unknown as NodeJS.WriteStream,
      process: processEvents,
      sessionManager: {} as never,
      renderer: new StreamingRenderer(),
      runtimeContext: {
        cwd: "/tmp/project-beta",
        projectRoot: "/tmp/project-beta",
        session: { id: "sess_abcdef0123456789" },
        runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64000 },
        gitContext: { branch: "main" },
      } as never,
      sessionRuntime: {
        getAgentMode: () => "build",
      getPermissionScope: () => "ask",
        getCurrentRunController: () => null,
        observeEvents: () => () => undefined,
        terminate: () => undefined,
        getState: () => "idle",
      } as never,
      logger: { error: () => undefined, info: () => undefined } as never,
      approvalTrustPolicy: {} as never,
      initialMcpGateway: {} as never,
      setReadline: (readline) => {
        capturedReadline = readline;
      },
      setActiveNonInteractiveApprovalMode: () => undefined,
      exit: (() => undefined) as never,
    });

    stdin.end();
    await loop;
    // A real readline drives the line loop, so question() comes from node itself.
    expect(capturedReadline).not.toBeNull();
    expect(typeof capturedReadline?.question).toBe("function");
  });
});