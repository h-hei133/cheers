import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CoreMcpGateway } from "./gateway.js";

/**
 * What the control plane says it can do.
 *
 * The protocol defines three primitives and this build reaches one of them. The
 * failure this guards against is not a missing feature — it is claiming one. A
 * snapshot carrying empty `resources` and `prompts` maps reads as "this server
 * has none", which is a different statement from "this build cannot ask", and
 * the difference is what a reader would act on.
 */

describe("the MCP surface this build offers", () => {
  it("reports tools and nothing it cannot fetch", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-surface-"));
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "mcp-work-"));
    const previousHome = process.env.HOME;
    const previousProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    try {
      const snapshot = await new CoreMcpGateway(workspace).snapshot();

      expect(snapshot).toHaveProperty("clients");
      expect(snapshot).toHaveProperty("tools");
      // Absent, not empty: there is no way to fetch either, so there is nothing
      // truthful to put here.
      expect(snapshot).not.toHaveProperty("resources");
      expect(snapshot).not.toHaveProperty("prompts");
    } finally {
      if (previousHome === undefined) delete process.env.HOME;
      else process.env.HOME = previousHome;
      if (previousProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = previousProfile;
      fs.rmSync(home, { recursive: true, force: true });
      fs.rmSync(workspace, { recursive: true, force: true });
    }
  });
});
