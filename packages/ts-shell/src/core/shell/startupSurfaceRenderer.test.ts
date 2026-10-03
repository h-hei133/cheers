import path from "node:path";
import { expect, it } from "vitest";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { renderWorkspaceBindingLines } from "./startupSurfaceRenderer.js";

it("reports case-distinct requested and bound roots according to the host", () => {
  const lines: string[] = [];
  const renderer = new StreamingRenderer();
  renderer.renderLine = line => { lines.push(line); };
  const requested = path.resolve("CaseRoot");
  const projectRoot = path.resolve("caseroot");
  renderWorkspaceBindingLines(renderer, { requestedWorkspaceRoot: requested, projectRoot,
    rootMode: "git-root", targetPathBase: projectRoot, gitRoot: projectRoot,
    gitContext: { insideGit: true, root: projectRoot },
  });
  expect(lines).toContain(`- Requested workspace: ${requested}`);
  expect(lines).toContain(`- Target path base: ${projectRoot}`);
  expect(lines.some(line => line.includes("git-root auto-upgrade"))).toBe(process.platform !== "win32");
  expect(lines.includes("- Root resolution: requested workspace is the git project root")).toBe(process.platform === "win32");
});
