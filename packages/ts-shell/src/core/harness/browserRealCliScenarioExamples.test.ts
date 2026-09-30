import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { agentCliAssertionFailures } from "../../test-utils/cli/assertions.js";
import { runAgentCliScenario } from "../../test-utils/cli/runner.js";
import type { AgentCliScenario } from "../../test-utils/cli/model.js";

describe("browser real CLI scenario examples", () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  function tempRoot(prefix: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(root);
    return root;
  }

  it("covers default blocked browser execute observe through the real CLI", async () => {
    const projectPath = tempRoot("cheers-cli-route99-project-");
    fs.writeFileSync(path.join(projectPath, "README.md"), "Route 99 fixture\n", "utf8");
    const scenario: AgentCliScenario = {
      id: "cli-browser-observe-blocked",
      name: "browser observe blocked through real CLI",
      metadata: {
        route: "99",
        capability: ["browser", "execute", "blocked", "real-cli"],
      },
      steps: [
        {
          id: "browser-observe",
          kind: "cli-command",
          prompt: "/browser execute observe",
          assertions: [
            { id: "browser-execution", kind: "stdout-contains", text: "Browser execution" },
            { id: "blocked", kind: "stdout-contains", text: "blocked-no-executor" },
            { id: "executed-no", kind: "executed-no" },
            { id: "no-browser-process", kind: "stdout-contains", text: "Browser process: not launched" },
          ],
        },
      ],
      expectedOutcome: { status: "passed" },
    };

    const result = await runAgentCliScenario({
      scenario,
      projectPath,
      homeDir: tempRoot("cheers-cli-route99-home-"),
    });

    expect(agentCliAssertionFailures(result)).toEqual([]);
    expect(result.status).toBe("passed");
  });
});
