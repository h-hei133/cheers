import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildTargetedContextPacket } from "./contextPacket.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "context-packet-"));
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "src", "dep.ts"), "export const dep = 1;\n");
  await fs.writeFile(
    path.join(workspaceRoot, "src", "target.ts"),
    "import { dep } from './dep.js';\nexport const target = dep;\n",
  );
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("buildTargetedContextPacket", () => {
  it("builds a replay-safe no-write packet", async () => {
    const packet = await buildTargetedContextPacket({
      workspaceRoot,
      targetPath: "src/target.ts",
    });

    expect(packet.packetId).toMatch(/^ctx_[a-f0-9]{12}$/);
    expect(packet.targetSafeLabel).toBe("src/target.ts");
    expect(packet.mutationAuthority).toBe("not-granted");
    expect(packet.redactionStatus).toBe("redacted-and-budgeted");
    expect(packet.replaySafeSummary).toContain("mutationAuthority=not-granted");
    expect(packet.evidence).toContain("context-packet:raw-full-content-excluded");
    expect(packet.selectedCandidateSummaries.some((source) => source.kind === "direct-import")).toBe(true);
  });
});

