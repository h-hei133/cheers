import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { AltScreenManager } from "./altScreen.js";
import { InteractiveTuiSession } from "./interactiveTuiSession.js";

describe("AltScreenManager & Terminal Lifecycle", () => {
  let manager: AltScreenManager;

  beforeEach(() => {
    manager = new AltScreenManager();
  });

  afterEach(() => {
    manager.leave();
  });

  it("toggles active state upon enter and leave", () => {
    expect(manager.isAltScreenActive()).toBe(false);

    manager.enter({ exitMode: "clean" });
    expect(manager.isAltScreenActive()).toBe(true);

    manager.leave();
    expect(manager.isAltScreenActive()).toBe(false);
  });

  it("records transcript lines for replay mode", () => {
    manager.enter({ exitMode: "replay" });
    manager.recordTranscript(["Line 1", "Line 2"]);
    expect(manager.isAltScreenActive()).toBe(true);

    // Leaving replay mode drains recorded lines to stdout
    manager.leave();
    expect(manager.isAltScreenActive()).toBe(false);
  });
});

describe("InteractiveTuiSession", () => {
  it("initializes and updates session prompt and state without throwing", () => {
    const session = new InteractiveTuiSession({
      modelName: "claude-3.5-sonnet",
      gitBranch: "main",
      exitMode: "clean",
    });

    expect(() => {
      session.start();
      session.setPrompt("npm test");
      session.setExecutionState(true, "Running bash: npm test...");
      session.updateTokenUsage(15000);
      session.stop();
    }).not.toThrow();
  });
});
