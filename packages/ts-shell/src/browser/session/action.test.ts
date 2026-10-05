import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserSessionManager } from "../sessionManager.js";
import { admitBrowserUrl } from "../urlAdmission.js";
import type { PwPage } from "../playwrightRuntime.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup() {
  const page = {
    goto: vi.fn(async () => {}), url: () => "http://localhost/", title: vi.fn(async () => "Local"),
    evaluate: vi.fn(async () => []), close: vi.fn(async () => {}), on: vi.fn(),
    click: vi.fn(async () => {}), fill: vi.fn(async () => {}), selectOption: vi.fn(async () => {}),
    hover: vi.fn(async () => {}), keyboard: { press: vi.fn(async () => {}) },
  };
  const launch = vi.fn(async () => page as unknown as PwPage);
  const manager = new BrowserSessionManager({ admitUrl: admitBrowserUrl, launchPage: launch });
  return { page, launch, manager };
}

afterEach(() => vi.useRealTimers());

describe("browser operation cancellation", () => {
  it.each(["abort", "deadline"])("does no launch or work for pre-%s", async (reason) => {
    const { manager, launch } = setup();
    const controller = new AbortController();
    if (reason === "abort") controller.abort();
    const result = await manager.run({ signal: controller.signal, deadline: reason === "deadline" ? 0 : undefined }, () => manager.openUrl("http://localhost/"));
    expect(result).toMatchObject({ status: "cancelled", evidence: { activity: "not-started", effect: "none", cleanup: "not-needed" } });
    expect(launch).not.toHaveBeenCalled();
  });

  it("collects a late launch without navigating or observing", async () => {
    const { manager, launch, page } = setup();
    const ready = deferred<PwPage>();
    const started = deferred<void>();
    launch.mockImplementationOnce(() => { started.resolve(); return ready.promise; });
    const controller = new AbortController();
    const pending = manager.run({ signal: controller.signal }, async () => {
      await manager.openUrl("http://localhost/");
      return manager.observe();
    });
    await started.promise;
    controller.abort();
    ready.resolve(page as unknown as PwPage);
    expect(await pending).toMatchObject({ status: "cancelled", evidence: { effect: "none", cleanup: "complete" } });
    expect(page.close).toHaveBeenCalledTimes(1);
    expect(page.goto).not.toHaveBeenCalled();
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it("closes an in-flight action and never starts the next one", async () => {
    const { manager, page } = setup();
    await manager.openUrl("http://localhost/");
    const clicked = deferred<void>();
    const started = deferred<void>();
    page.click.mockImplementationOnce(() => { started.resolve(); return clicked.promise; });
    page.close.mockImplementationOnce(async () => { clicked.reject(new Error("closed")); });
    const controller = new AbortController();
    const pending = manager.run({ signal: controller.signal, taskId: "click-1" }, async () => {
      await manager.click("#go");
      return manager.type("#field", "next");
    });
    await started.promise;
    controller.abort();
    expect(await pending).toMatchObject({ status: "cancelled", evidence: { taskId: "click-1", effect: "possible", cleanup: "complete" } });
    expect(page.fill).not.toHaveBeenCalled();
    expect(page.close).toHaveBeenCalled();
  });

  it("retains confirmed effects when cancellation follows a completed click", async () => {
    const { manager, page } = setup();
    await manager.openUrl("http://localhost/");
    const controller = new AbortController();
    page.click.mockImplementationOnce(async () => { controller.abort(); });
    expect(await manager.run({ signal: controller.signal }, () => manager.click("#go"))).toMatchObject({
      status: "cancelled", evidence: { effect: "confirmed", cleanup: "complete" },
    });
  });

  it("keeps stalled work in the lane after returning unknown, while queued cancellation does no work", async () => {
    const { manager, page } = setup();
    await manager.openUrl("http://localhost/");
    const clicked = deferred<void>();
    const started = deferred<void>();
    page.click.mockImplementationOnce(() => { started.resolve(); return clicked.promise; });
    const controller = new AbortController();
    const pending = manager.run({ signal: controller.signal }, () => manager.click("#go"));
    await started.promise;
    vi.useFakeTimers();
    controller.abort();
    await vi.advanceTimersByTimeAsync(4_000);
    expect(await pending).toMatchObject({ status: "cancelled", evidence: { cleanup: "unknown" } });
    const next = new AbortController();
    const operation = vi.fn(async () => {});
    const queued = manager.run({ signal: next.signal }, operation);
    next.abort();
    expect(await queued).toMatchObject({ status: "cancelled", evidence: { activity: "not-started", cleanup: "not-needed" } });
    expect(operation).not.toHaveBeenCalled();
    expect(page.close).toHaveBeenCalledTimes(1);
    clicked.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect((await manager.run({}, operation)).status).toBe("completed");
  });

  it("preserves cleanup failure and refuses retained handles until close retry", async () => {
    const { manager, page } = setup();
    await manager.openUrl("http://localhost/");
    const controller = new AbortController();
    page.click.mockImplementationOnce(async () => { controller.abort(); });
    page.close.mockRejectedValue(new Error("still open"));
    expect(await manager.run({ signal: controller.signal }, () => manager.click("#go"))).toMatchObject({
      status: "cancelled", evidence: { cleanup: "failed" },
    });
    expect(await manager.click("#go")).toMatchObject({ ok: false, failure: { kind: "close-failed" } });
    expect(page.click).toHaveBeenCalledTimes(1);
    page.close.mockResolvedValue();
    expect(await manager.closeSession()).toMatchObject({ ok: true });
  });

  it("reports evaluation failure rather than a successful empty page", async () => {
    const { manager, page } = setup();
    page.evaluate.mockRejectedValue(new Error("disconnected"));
    const state = await manager.observe();
    expect(state.failure?.kind).toBe("action-failed");
    expect(state.outline).not.toContain("No interactive elements found");
    await manager.closeSession();
  });
});

it("expires a running action and leaves the next operation unstarted", async () => {
  const { manager, page } = setup();
  await manager.openUrl("http://localhost/");
  const clicked = deferred<void>();
  const started = deferred<void>();
  page.click.mockImplementationOnce(() => { started.resolve(); return clicked.promise; });
  page.close.mockImplementationOnce(async () => clicked.reject(new Error("closed")));
  vi.useFakeTimers();
  const pending = manager.run({ deadline: Date.now() + 50 }, () => manager.click("#go"));
  await started.promise;
  await vi.advanceTimersByTimeAsync(50);
  expect(await pending).toMatchObject({ status: "cancelled", evidence: { reason: "deadline", effect: "possible", cleanup: "complete" } });
});

it("allows explicit close while cancelled action work remains unsettled", async () => {
  const { manager, page } = setup();
  await manager.openUrl("http://localhost/");
  const clicked = deferred<void>();
  const started = deferred<void>();
  page.click.mockImplementationOnce(() => { started.resolve(); return clicked.promise; });
  const pending = manager.run({}, () => manager.click("#go"));
  await started.promise;
  expect(await manager.run({}, () => manager.closeSession(), true)).toMatchObject({ status: "completed", value: { ok: true } });
  clicked.resolve();
  expect(await pending).toMatchObject({ status: "cancelled", evidence: { reason: "session-close", cleanup: "complete" } });
});

it("bounds close during a stalled launch and cleans the late page without navigation", async () => {
  const { manager, launch, page } = setup();
  const ready = deferred<PwPage>();
  const started = deferred<void>();
  launch.mockImplementationOnce(() => { started.resolve(); return ready.promise; });
  const pending = manager.run({}, () => manager.openUrl("http://localhost/"));
  await started.promise;
  vi.useFakeTimers();
  const closing = manager.run({}, () => manager.closeSession(), true);
  await vi.advanceTimersByTimeAsync(1_000);
  expect(await closing).toMatchObject({ status: "completed", value: { ok: false, failure: { cleanup: "unknown" } } });
  ready.resolve(page as unknown as PwPage);
  await vi.advanceTimersByTimeAsync(0);
  expect(await pending).toMatchObject({ status: "cancelled", evidence: { cleanup: "complete" } });
  expect(page.close).toHaveBeenCalledTimes(1);
  expect(page.goto).not.toHaveBeenCalled();
});
