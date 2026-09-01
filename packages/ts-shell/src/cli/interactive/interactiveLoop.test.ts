import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { Interface as ReadlineInterface } from "node:readline";
import { describe, expect, it } from "vitest";

import { runInteractiveLoop } from "./interactiveLoop.js";

describe("interactive loop", () => {
  it("boots the TUI-driven interactive mode and wires a compatibility readline", async () => {
    const stdin = new PassThrough() as NodeJS.ReadStream;
    const stdout = new PassThrough() as NodeJS.WriteStream;
    const processEvents = new EventEmitter() as NodeJS.Process;
    let capturedReadline: ReadlineInterface | null = null;

    await runInteractiveLoop({
      stdin,
      stdout,
      process: processEvents,
      sessionManager: {} as never,
      renderer: {
        renderLine: () => undefined,
      } as never,
      runtimeContext: {
        cwd: "/tmp/project-alpha",
        projectRoot: "/tmp/project-alpha",
        session: { id: "sess_1234567890abcdef" },
        runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64000 },
        gitContext: { branch: "main" },
      } as never,
      sessionRuntime: {
        getAgentMode: () => "build",
        getCurrentRunController: () => null,
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
      exit: ((code?: number) => {
        throw new Error(`unexpected exit ${code ?? ""}`.trim());
      }) as never,
    });

    // The TUI mode wires a compatibility readline proxy (dummy) for downstream
    // command routers; its prompt() triggers a TUI redraw, not a string chrome.
    expect(capturedReadline).not.toBeNull();
    expect(typeof capturedReadline?.prompt).toBe("function");
    expect(typeof capturedReadline?.close).toBe("function");

    capturedReadline?.close();
    stdin.destroy();
    stdout.destroy();
  });
});