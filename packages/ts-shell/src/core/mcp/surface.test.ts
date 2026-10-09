import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CoreMcpGateway } from "./gateway.js";

/**
 * What the control plane says it can do.
 *
 * Tool discovery must not imply discovery of resources or prompts. Those
 * catalogs are fetched explicitly through the content channel. An empty map on
 * a tools-only snapshot would misrepresent a catalog that was never requested.
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
      // This snapshot did not fetch either catalog.
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
