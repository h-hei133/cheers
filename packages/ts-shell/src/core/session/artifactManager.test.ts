import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ArtifactManager } from "./artifactManager.js";

describe("ArtifactManager In-Session Spilling", () => {
  let tempWorkspace: string;

  beforeEach(() => {
    tempWorkspace = fs.mkdtempSync(path.join(os.tmpdir(), "artifact-test-"));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempWorkspace, { recursive: true, force: true });
    } catch {
      // Cleanup best-effort
    }
  });

  it("saves large tool output to disk and resolves via artifact:// URI", async () => {
    const manager = new ArtifactManager(tempWorkspace, "test-session");
    const content = "Large bash log output\nLine 2\nLine 3";

    const saved = await manager.save(content, "bash");
    expect(saved.id).toBe("0");
    expect(saved.uri).toBe("artifact://0");
    expect(saved.totalLines).toBe(3);
    expect(fs.existsSync(saved.path)).toBe(true);

    const resolved = manager.resolve("artifact://0");
    expect(resolved).not.toBeNull();
    expect(resolved).toBe(saved.path);

    const readBack = fs.readFileSync(resolved!, "utf8");
    expect(readBack).toBe(content);
  });
});
