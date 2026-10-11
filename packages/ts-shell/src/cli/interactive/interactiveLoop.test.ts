import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { Interface as ReadlineInterface } from "node:readline";
import { describe, expect, it, vi } from "vitest";

import { runInteractiveLoop } from "./interactiveLoop.js";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { withConfiguration } from "../../test-utils/configuration.js";

describe("interactive loop", () => {
  it("uses the full-screen host and its readline stand-in on a real terminal", async () => {
    const stdin = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.ReadStream;
    const stdout = Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.WriteStream;
    const processEvents = new EventEmitter() as NodeJS.Process;
    let capturedReadline: ReadlineInterface | null = null;
    const stop = new AbortController();

    const loop = runInteractiveLoop({
      stdin,
      stdout,
      process: processEvents,
      sessionManager: { sessionExists: () => false } as never,
      renderer: new StreamingRenderer(),
      runtimeContext: withConfiguration({
        cwd: "/tmp/project-alpha",
        projectRoot: "/tmp/project-alpha",
        session: { id: "sess_1234567890abcdef" },
        runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64000, configDiagnostics: [] },
        gitContext: { branch: "main" },
      } as never),
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
      stopSignal: stop.signal,
    });

    // The host owns raw stdin, so downstream command routers get a readline
    // stand-in whose question() is answered from the host's own prompt.
    expect(capturedReadline).not.toBeNull();
    expect(typeof capturedReadline?.question).toBe("function");
    expect(typeof capturedReadline?.close).toBe("function");

    stop.abort();
    await loop;
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
    const sessionExists = vi.fn(() => false);
    const exit = vi.fn();
    const loop = runInteractiveLoop({
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: new PassThrough() as unknown as NodeJS.WriteStream,
      process: processEvents,
      sessionManager: { sessionExists } as never,
      renderer: new StreamingRenderer(),
      runtimeContext: withConfiguration({
        cwd: "/tmp/project-beta",
        projectRoot: "/tmp/project-beta",
        session: { id: "sess_abcdef0123456789" },
        runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64000, configDiagnostics: [] },
        gitContext: { branch: "main" },
      } as never),
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
      exit,
    });

    stdin.end();
    await loop;
    // Actual readline drives the input while questions use the host stand-in.
    expect(capturedReadline).not.toBeNull();
    expect(typeof capturedReadline?.question).toBe("function");
    expect(sessionExists.mock.calls).toEqual([["sess_abcdef0123456789"]]);
    expect(exit.mock.calls).toEqual([[0]]);
    expect(processEvents.listenerCount("SIGINT")).toBe(0);
  });
});
