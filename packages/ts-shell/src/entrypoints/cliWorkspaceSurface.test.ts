import { describe, expect, it, vi } from "vitest";
import {
  renderRecentProjectContexts,
  renderWorkspaceSummary,
} from "./cliWorkspaceSurface.js";
import type { ShellRuntimeContext } from "../core/shell/runtimeContext.js";

function capture(render: (renderer: { renderLine(line: string): void }) => void) {
  const lines: string[] = [];
  render({
    renderLine(line) {
      lines.push(line);
    },
  });
  return lines;
}

describe("CLI workspace surface", () => {
  it("renders workspace summary from an existing runtime context", () => {
    const context = {
      cwd: "/tmp/project",
      originalCwd: "/tmp",
      projectRoot: "/tmp/project",
      rootMode: "git-root",
      requestedWorkspaceRoot: "/tmp/project",
      targetPathBase: "/tmp/project",
      gitRoot: "/tmp/project",
      rootBindingDiagnostics: [],
      runtimeConfig: {},
      gitContext: {
        insideGit: true,
        branch: "main",
        isClean: true,
        root: "/tmp/project",
      },
      session: {
        id: "sess_workspace",
        projectRoot: "/tmp/project",
        createdAt: "2026-05-13T00:00:00.000Z",
        updatedAt: "2026-05-13T00:00:00.000Z",
        status: "active",
        turns: [],
      },
      activeSession: {
        sessionId: "sess_workspace",
        sessionProjectDir: "/tmp/project",
      },
    } as ShellRuntimeContext;

    const lines = capture((renderer) =>
      renderWorkspaceSummary(renderer, context),
    );

    expect(lines).toContain("\nWorkspace");
    expect(lines).toContain("- Project: project");
    expect(lines).toContain("- Project root: /tmp/project");
    expect(lines).toContain("- Workspace clean: yes");
    expect(lines).toContain("- Active session: sess_workspace [active]");
    expect(lines.at(-1)).toBe("");
  });

  it("renders recent project contexts without reading session state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-13T00:01:30.000Z"));
    try {
      const lines = capture((renderer) =>
        renderRecentProjectContexts(renderer, [
          {
            projectRoot: "/tmp/project-a",
            lastUpdatedAt: "2026-05-13T00:00:00.000Z",
            lastSessionId: "sess_a",
            sessionCount: 2,
            recoverableCount: 1,
          },
        ]),
      );

      expect(lines).toEqual([
        "\nRecent project contexts",
        "- project-a  sessions=2  1 recoverable  updated=1m ago  last=sess_a",
        "Attach quickly with /workspace attach <path>. Resume the last interrupted run with /resume after switching project context.",
        "",
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the empty recent-project guidance", () => {
    const lines = capture((renderer) =>
      renderRecentProjectContexts(renderer, []),
    );

    expect(lines).toEqual([
      "\nRecent project contexts",
      "- No project contexts found yet.",
      "- Start with /workspace attach <path> to bind a target project.",
      "",
    ]);
  });
});
