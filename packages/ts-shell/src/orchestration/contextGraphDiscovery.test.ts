import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { discoverContextGraph } from "./contextGraphDiscovery.js";

let workspaceRoot: string;

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "context-graph-"));
  await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "lib"), { recursive: true });
  await fs.mkdir(path.join(workspaceRoot, "docs"), { recursive: true });
  await fs.writeFile(
    path.join(workspaceRoot, "lib", "leaf.ts"),
    "export const leaf = 1;\n",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "helper.ts"),
    "import { leaf } from '../lib/leaf.js';\nexport function helperValue() { return leaf; }\n",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "target.ts"),
    "import { helperValue } from './helper.js';\nexport function targetThing() { return helperValue(); }\n",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "target.test.ts"),
    "import { targetThing } from './target.js';\nexpect(targetThing()).toBe(1);\n",
  );
  await fs.writeFile(
    path.join(workspaceRoot, "src", "consumer.ts"),
    "import { targetThing } from './target.js';\nexport const consumed = targetThing();\n",
  );
  await fs.writeFile(path.join(workspaceRoot, "README.md"), "# fixture\n");
  await fs.writeFile(path.join(workspaceRoot, "docs", "target.md"), "# target docs\n");
});

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true });
});

describe("discoverContextGraph", () => {
  it("builds a bounded deterministic graph with imports, tests, docs, call-sites, and second-hop candidates", async () => {
    const graph = await discoverContextGraph({
      workspaceRoot,
      targetPath: "src/target.ts",
    });

    expect(graph.rootTarget).toBe("src/target.ts");
    expect(graph.mutationAuthority).toBe("not-granted");
    expect(graph.includedCandidates.map((node) => [node.kind, node.pathLabel])).toEqual(
      expect.arrayContaining([
        ["root-target", "src/target.ts"],
        ["direct-import", "src/helper.ts"],
        ["nearby-test", "src/target.test.ts"],
        ["docs-readme", "README.md"],
        ["reverse-call-site", "src/consumer.ts"],
        ["second-hop-candidate", "lib/leaf.ts"],
      ]),
    );
    expect(graph.evidence).toEqual(
      expect.arrayContaining([
        "context-graph-discovery:deterministic",
        "context-graph-discovery:depth-max:2",
        "context-graph-discovery:no-mutation",
        "context-graph-discovery:no-provider-call",
        "context-graph-discovery:no-command-execution",
      ]),
    );
  });

  it("omits over-budget candidates with explicit safe reasons", async () => {
    const graph = await discoverContextGraph({
      workspaceRoot,
      targetPath: "src/target.ts",
      limits: { maxGraphNodes: 2 },
    });

    expect(graph.omittedCandidates.length).toBeGreaterThan(0);
    expect(graph.omittedCandidates.map((node) => node.omissionReason)).toContain(
      "over-node-budget",
    );
    expect(graph.omittedCandidates.every((node) => Boolean(node.reason))).toBe(true);
  });
});
