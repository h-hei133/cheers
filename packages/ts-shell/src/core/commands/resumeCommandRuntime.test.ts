import { describe, expect, it } from "vitest";
import { runResumeCommand } from "./resumeCommandRuntime.js";

const CONTEXT = { cwd: "/workspace", sessionId: "sess_current" };

describe("resume as the only session entry point", () => {
  it("opens the session surface when called bare", async () => {
    expect(await runResumeCommand([], CONTEXT)).toEqual({
      kind: "shell-action",
      action: "resume-session",
    });
  });

  it("treats a bare argument as the session to continue", async () => {
    expect(await runResumeCommand(["sess_abc123"], CONTEXT)).toEqual({
      kind: "shell-action",
      action: "resume-session",
      sessionId: "sess_abc123",
    });
  });

  it.each([
    ["list", "list"],
    ["ls", "list"],
    ["current", "current"],
    ["active", "current"],
    ["help", "help"],
  ])("routes the %s form to the %s view", async (given, expected) => {
    expect(await runResumeCommand([given], CONTEXT)).toEqual({
      kind: "shell-action",
      action: "list-sessions",
      sessionAction: expected,
    });
  });

  it("carries a switch target through", async () => {
    expect(await runResumeCommand(["switch", "last"], CONTEXT)).toEqual({
      kind: "shell-action",
      action: "list-sessions",
      sessionAction: "switch",
      sessionId: "last",
    });
  });

  it("asks for switch usage when no target is given", async () => {
    expect(await runResumeCommand(["switch"], CONTEXT)).toEqual({
      kind: "shell-action",
      action: "list-sessions",
      sessionAction: "switch",
    });
  });

  it("ignores case in the form, since the user is typing it", async () => {
    expect(await runResumeCommand(["LIST"], CONTEXT)).toMatchObject({ sessionAction: "list" });
  });
});
