import { describe, expect, it } from "vitest";
import type { QueryEvent } from "../query/runtime/events.js";
import { ShellSessionRuntime } from "./sessionRuntime.js";

function completedEvent(sessionId: string, prompt: string): QueryEvent {
  return {
    type: "query.completed",
    result: {
      status: "completed",
      terminalReason: "completed",
      terminalClassification: "success",
      transcript: [],
      sharedContext: {
        sessionId,
        initialPrompt: prompt,
        notes: [],
        handoffs: [],
      },
      finalOutput: prompt,
    },
  };
}

function idleManager() {
  return {
    markRunStarted() {},
    persistUserPromptBarrier() {},
    markTurnActive() {},
    appendQueryEvent() {},
    addTurn() {},
    saveCompleted() {},
    saveInterrupted() {},
    saveError() {},
    saveTerminated() {},
  } as never;
}

function silentRenderer() {
  return { renderLine() {}, renderChunk() {} } as never;
}

describe("shell session runtime idle barrier", () => {
  it('keeps a cancelled local command registered until its cleanup settles', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const runtime = new ShellSessionRuntime({ sessionManager: idleManager(), renderer: silentRenderer(),
      runPrompt: () => { throw new Error('Unexpected prompt'); } });
    let signal!: AbortSignal;
    const running = runtime.commands.run(async current => { signal = current; await gate; return 'cancelled command'; });
    const controller = runtime.getCurrentRunController();
    expect(controller).not.toBeNull();
    await Promise.resolve();
    expect(controller?.signal).toBe(signal);
    let idle = false;
    const cancelled = runtime.cancelAndWait().then(() => { idle = true; });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(signal.aborted).toBe(true); expect(idle).toBe(false);
    expect(runtime.getCurrentRunController()).toBe(controller);
    await expect(runtime.commands.run(async () => 'overlap')).rejects.toThrow('still running');
    expect(runtime.getCurrentRunController()).toBe(controller);
    release();
    await expect(running).resolves.toBe('cancelled command');
    await cancelled;
    expect(idle).toBe(true); expect(runtime.getCurrentRunController()).toBeNull();
    await expect(runtime.commands.run(async () => 'next')).resolves.toBe('next');
  });

  it('preserves a command rejection for both its caller and an existing idle waiter', async () => {
    const runtime = new ShellSessionRuntime({ sessionManager: idleManager(), renderer: silentRenderer(),
      runPrompt: () => { throw new Error('Unexpected prompt'); } });
    const running = runtime.commands.run(async () => { throw new Error('command failed'); });
    const idle = runtime.waitForIdle();
    await expect(running).rejects.toThrow('command failed');
    await expect(idle).rejects.toThrow('command failed');
    expect(runtime.getCurrentRunController()).toBeNull();
  });

  it("resolves immediately when no run is active", async () => {
    const runtime = new ShellSessionRuntime({
      sessionManager: idleManager(),
      renderer: silentRenderer(),
      runPrompt: async function* () {
        yield completedEvent("sess_idle", "hi");
      },
    });

    await expect(runtime.waitForIdle()).resolves.toBeUndefined();
  });

  it("waits for the active run to settle after cancel", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const order: string[] = [];
    const runtime = new ShellSessionRuntime({
      sessionManager: idleManager(),
      renderer: silentRenderer(),
      runPrompt: async function* (_prompt, signal) {
        await gate;
        if (signal.aborted) {
          throw new Error("Aborted");
        }
        yield completedEvent("sess_cancel", "hi");
      },
    });

    const running = runtime.executePrompt("sess_cancel", "hi");
    await new Promise((resolve) => setTimeout(resolve, 0));
    runtime.cancelCurrentRun();
    const idle = runtime.waitForIdle().then(
      () => {
        order.push("idle-resolved");
      },
      () => {
        order.push("idle-rejected");
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual([]);
    release();
    await expect(running).rejects.toThrow("Aborted");
    await idle;
    expect(order).toEqual(["idle-rejected"]);
  });

  it("cancelAndWait settles only after the run finishes", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runtime = new ShellSessionRuntime({
      sessionManager: idleManager(),
      renderer: silentRenderer(),
      runPrompt: async function* (_prompt, signal) {
        await gate;
        if (signal.aborted) {
          throw new Error("Aborted");
        }
        yield completedEvent("sess_cancel_wait", "hi");
      },
    });

    const running = runtime.executePrompt("sess_cancel_wait", "hi");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const order: string[] = [];
    const cancelled = runtime.cancelAndWait().then(() => {
      order.push("cancelled");
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(order).toEqual([]);
    release();
    await expect(running).rejects.toThrow("Aborted");
    await cancelled;
    expect(order).toEqual(["cancelled"]);
    await expect(runtime.waitForIdle()).rejects.toThrow("Aborted");
  });

  it("waitForIdle surfaces run failures to explicit awaiters", async () => {
    const runtime = new ShellSessionRuntime({
      sessionManager: idleManager(),
      renderer: silentRenderer(),
      runPrompt: async function* () {
        throw new Error("provider down");
        yield completedEvent("sess_fail", "hi");
      },
    });

    const running = runtime.executePrompt("sess_fail", "hi");
    await expect(running).rejects.toThrow("provider down");
    await expect(runtime.waitForIdle()).rejects.toThrow("provider down");
  });
});
