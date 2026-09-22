import { describe, expect, it, vi } from "vitest";
import { QuestionBridge } from "./questionBridge.js";

describe("readline stand-in", () => {
  it("publishes the question rather than reading the device", () => {
    // Reading stdin here would fight the host for raw-mode keystrokes.
    const ask = vi.fn();
    const bridge = new QuestionBridge({ ask, settle: () => {} });
    const readline = bridge.asReadline(() => {});
    readline.question("Approve write? (y/n) ", () => {});
    expect(ask).toHaveBeenCalledWith("Approve write? (y/n)");
    expect(bridge.question()).toBe("Approve write? (y/n)");
  });

  it("resolves the pending question with the submitted text", () => {
    const settle = vi.fn();
    const bridge = new QuestionBridge({ ask: () => {}, settle });
    const answers: string[] = [];
    bridge.asReadline(() => {}).question("ok?", (answer) => answers.push(answer));
    expect(bridge.answer("y")).toBe(true);
    expect(answers).toEqual(["y"]);
    expect(settle).toHaveBeenCalledOnce();
    expect(bridge.question()).toBeUndefined();
  });

  it("reports that a submission was not an answer when nothing is pending", () => {
    const bridge = new QuestionBridge({ ask: () => {}, settle: () => {} });
    expect(bridge.answer("hello")).toBe(false);
  });

  it("declines a pending question on shutdown instead of hanging", () => {
    const bridge = new QuestionBridge({ ask: () => {}, settle: () => {} });
    const answers: string[] = [];
    bridge.asReadline(() => {}).question("ok?", (answer) => answers.push(answer));
    bridge.abandon();
    expect(answers).toEqual(["n"]);
  });

  it("routes close to the host teardown", () => {
    const onClose = vi.fn();
    const bridge = new QuestionBridge({ ask: () => {}, settle: () => {} });
    bridge.asReadline(onClose).close();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
