import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadHookDeclarations } from "./config.js";

describe("hook configuration loading", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hooks-config-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeConfig(root: string, contents: unknown, name = "hooks.json"): void {
    fs.mkdirSync(path.join(root, ".agents"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".agents", name),
      typeof contents === "string" ? contents : JSON.stringify(contents, null, 2),
      "utf8",
    );
  }

  it("reads a declared command hook", () => {
    writeConfig(tempDir, {
      hooks: { PreToolUse: [{ matcher: "bash", hooks: [{ type: "command", command: "audit.sh" }] }] },
    });

    const loaded = loadHookDeclarations(tempDir);

    expect(loaded.hooks).toHaveLength(1);
    expect(loaded.hooks[0]?.command).toBe("audit.sh");
    expect(loaded.hooks[0]?.event).toBe("PreToolUse");
    expect(loaded.hooks[0]?.matcher).toBe("bash");
  });

  it("returns nothing when there is no configuration", () => {
    expect(loadHookDeclarations(tempDir).hooks).toEqual([]);
  });

  it("reports an unparseable file rather than failing the run", () => {
    writeConfig(tempDir, "{ this is not json");

    const loaded = loadHookDeclarations(tempDir);

    expect(loaded.hooks).toEqual([]);
    expect(loaded.problems).toHaveLength(1);
  });

  it("reports an unknown event rather than registering it", () => {
    writeConfig(tempDir, {
      hooks: { NotARealEvent: [{ hooks: [{ type: "command", command: "x.sh" }] }] },
    });

    const loaded = loadHookDeclarations(tempDir);

    expect(loaded.hooks).toEqual([]);
    expect(loaded.problems[0]).toContain("NotARealEvent");
  });

  it("ignores a handler that declares no command", () => {
    writeConfig(tempDir, {
      hooks: { PreToolUse: [{ hooks: [{ type: "command" }] }] },
    });

    const loaded = loadHookDeclarations(tempDir);

    expect(loaded.hooks).toEqual([]);
    expect(loaded.problems).toHaveLength(1);
  });

  it("reads the user-level file as well as the project one", () => {
    // The two scopes live in different places: a project keeps its tool
    // definitions under `.agents`, the user's own under `.cheers`, which
    // is the same split the sandbox rules already use.
    const home = path.join(tempDir, "home");
    fs.mkdirSync(path.join(home, ".cheers"), { recursive: true });
    fs.writeFileSync(
      path.join(home, ".cheers", "hooks.json"),
      JSON.stringify({ hooks: { SessionStart: [{ hooks: [{ type: "command", command: "user.sh" }] }] } }),
      "utf8",
    );
    writeConfig(tempDir, { hooks: { SessionStart: [{ hooks: [{ type: "command", command: "project.sh" }] }] } });

    const loaded = loadHookDeclarations(tempDir, { homeDir: home });

    expect(loaded.hooks.map((hook) => hook.command).sort()).toEqual(["project.sh", "user.sh"]);
  });
});
