import { describe, expect, it } from "vitest";
import { createBrowserSkillRunnerMetadata } from "./metadata.js";
import {
  createBrowserSkillRunnerBinding,
  serializeBrowserSkillRunnerBinding,
  validateBrowserSkillRunnerBinding,
} from "./binding.js";

describe("browser skill runner binding", () => {
  it("validates deterministic test-local process bindings", () => {
    const metadata = createBrowserSkillRunnerMetadata();
    const binding = createBrowserSkillRunnerBinding({
      metadata,
      runnerCommand: {
        command: process.execPath,
        args: ["/tmp/route106-skill-runner.cjs"],
      },
    });
    const result = validateBrowserSkillRunnerBinding(
      JSON.parse(serializeBrowserSkillRunnerBinding(binding)),
      metadata,
    );

    expect(result.ok).toBe(true);
    expect(result.ok ? result.binding.mode : "invalid").toBe("test-local-process");
  });

  it("rejects missing metadata, dynamic discovery, unsafe actions, and global commands", () => {
    const metadata = createBrowserSkillRunnerMetadata();
    const binding = createBrowserSkillRunnerBinding({
      metadata,
      runnerCommand: {
        command: process.execPath,
        args: ["/tmp/route106-skill-runner.cjs"],
      },
    });

    expect(validateBrowserSkillRunnerBinding(binding).ok).toBe(false);
    expect(validateBrowserSkillRunnerBinding({ ...binding, dynamicDiscovery: "enabled" }, metadata).ok).toBe(false);
    expect(validateBrowserSkillRunnerBinding({ ...binding, allowedActions: ["auth"] }, metadata).ok).toBe(false);
    expect(validateBrowserSkillRunnerBinding({
      ...binding,
      runnerCommand: { command: "playwright", args: ["mcp", "https://example.com"] },
    }, metadata).ok).toBe(false);
  });
});
