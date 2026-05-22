import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkCodeGraphStaleness } from "./codeGraphStaleness.js";
import { buildContextGraph } from "./contextGraph.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "code-graph-stale-"));
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.writeFile(path.join(workspaceRoot, "src", "app.ts"), "export const app = 1;\n");
  await fs.writeFile(path.join(workspaceRoot, "src", "lib.ts"), "export const lib = 1;\n");
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("checkCodeGraphStaleness", () => {
  it("reports fresh files when current metadata matches the baseline", async () => {
    const graph = graphFixture();
    const appStat = await fs.stat(path.join(workspaceRoot, "src", "app.ts"));
    const libStat = await fs.stat(path.join(workspaceRoot, "src", "lib.ts"));

    const result = await checkCodeGraphStaleness({
      workspaceRoot,
      graph,
      baseline: [
        { pathLabel: "src/app.ts", mtimeMs: appStat.mtimeMs, size: appStat.size },
        { pathLabel: "src/lib.ts", mtimeMs: libStat.mtimeMs, size: libStat.size },
      ],
    });

    expect(result.status).toBe("fresh");
    expect(result.mutationAuthority).toBe("not-granted");
  });

  it("downgrades stale related file facts without reading raw content", async () => {
    const graph = graphFixture();
    const appStat = await fs.stat(path.join(workspaceRoot, "src", "app.ts"));
    await fs.writeFile(path.join(workspaceRoot, "src", "lib.ts"), "export const lib = 2;\n");

    const result = await checkCodeGraphStaleness({
      workspaceRoot,
      graph,
      baseline: [
        { pathLabel: "src/app.ts", mtimeMs: appStat.mtimeMs, size: appStat.size },
        { pathLabel: "src/lib.ts", mtimeMs: 1, size: 1 },
      ],
    });

    expect(result.status).toBe("stale-related-file-changed");
    expect(result.staleLabels).toContain("src/lib.ts");
    expect(result.evidence).toContain("code-graph-staleness:raw-content-excluded");
  });

  it("classifies stale target changes separately from related file changes", async () => {
    const graph = graphFixture();
    await fs.writeFile(path.join(workspaceRoot, "src", "app.ts"), "export const app = 2;\n");
    const libStat = await fs.stat(path.join(workspaceRoot, "src", "lib.ts"));

    const result = await checkCodeGraphStaleness({
      workspaceRoot,
      graph,
      baseline: [
        { pathLabel: "src/app.ts", mtimeMs: 1, size: 1 },
        { pathLabel: "src/lib.ts", mtimeMs: libStat.mtimeMs, size: libStat.size },
      ],
    });

    expect(result.status).toBe("stale-target-changed");
    expect(result.staleLabels).toContain("src/app.ts");
  });
});

function graphFixture() {
  return buildContextGraph({
    rootTarget: "src/app.ts",
    nodes: [
      node("root-target", "src/app.ts", 0),
      node("direct-import", "src/lib.ts", 1),
    ],
    edges: [
      { fromPathLabel: "src/app.ts", toPathLabel: "src/lib.ts", kind: "imports", reason: "imports" },
    ],
  });
}

function node(
  kind: Parameters<typeof buildContextGraph>[0]["nodes"][number]["kind"],
  pathLabel: string,
  depth: 0 | 1 | 2,
): Parameters<typeof buildContextGraph>[0]["nodes"][number] {
  return {
    kind,
    pathLabel,
    relation: kind,
    sourceKind: "target-packet",
    depth,
    reason: kind,
    budgetStatus: "included",
    confidence: "high",
    redactionStatus: "redacted-and-budgeted",
  };
}
