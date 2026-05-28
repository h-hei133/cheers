import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { Interface as ReadlineInterface } from "node:readline";
import { describe, expect, it } from "vitest";

import { runInteractiveLoop } from "./interactiveLoop.js";

describe("interactive loop", () => {
  it("owns readline lifecycle while preserving initial prompt chrome", async () => {
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

    expect(capturedReadline?.getPrompt()).toBe(
      "[project-alpha|12345678|build] > ",
    );

    capturedReadline?.removeAllListeners("close");
    capturedReadline?.close();
    stdin.destroy();
    stdout.destroy();
  });
});
