import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let fakeHome = "";

describe("long-session compact/reload continuation durability", () => {
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), "cheers-long-session-durability-"));
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
  });

  afterEach(() => {
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  it("preserves two-file mutation success across auto-compact, process reload, /continue, and a later non-mutation turn", () => {
    const seed = runFixture("seed", "success");
    expect(seed.compacted).toBe(true);
    expect(seed.compactReason).toBe("auto-threshold");
    expect(seed.sourceTurnCount).toBe(12);
    expect(seed.snapshot.lastTerminalClassification).toBe("success");
    expect(seed.snapshot.recentChangedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(seed.snapshot.recentVerifiedFiles).toEqual(["src/a.ts", "src/b.ts"]);
    expect(seed.snapshot.recentFailedFiles).toEqual([]);
    expect(seed.context).toContain("- recent-changed-files: src/a.ts, src/b.ts");
    expect(seed.context).toContain("- recent-verified-files: src/a.ts, src/b.ts");
    expect(seed.context).toContain("Success handoff: status=passed");

    const initialContinue = runFixture("continue", "success", seed.sessionId);
    expect(initialContinue.turns).toHaveLength(1);
    expect(initialContinue.lines).toContain("FOCUSED_CONTINUATION_QUERY");
    expect(initialContinue.lines).toContain("- focus-terminal: success");
    expect(initialContinue.lines).toContain("- focus-changed-files: src/a.ts, src/b.ts");
    expect(initialContinue.lines).toContain("- focus-failed-files: ");
    expect(initialContinue.lines.join("\n")).not.toContain("rollback succeeded");
    expect(initialContinue.lines.join("\n")).not.toContain("atomic rollback");

    const afterUnrelated = runFixture(
      "append-unrelated",
      "success",
      seed.sessionId,
    );
    expect(afterUnrelated.snapshot.lastTerminalClassification).toBe("success");
    expect(afterUnrelated.snapshot.recentChangedFiles).toEqual([
      "src/a.ts",
      "src/b.ts",
    ]);
    expect(afterUnrelated.snapshot.recentFailedFiles).toEqual([]);
    expect(afterUnrelated.context).toContain(
      "- recent-changed-files: src/a.ts, src/b.ts",
    );

    const followUpAfterUnrelated = runFixture(
      "continue",
      "success",
      seed.sessionId,
    );
    expect(followUpAfterUnrelated.turns).toHaveLength(1);
    expect(followUpAfterUnrelated.lines).toContain("FOCUSED_CONTINUATION_QUERY");
    expect(followUpAfterUnrelated.lines).toContain("- focus-terminal: success");
    expect(followUpAfterUnrelated.lines).toContain(
      "- focus-changed-files: src/a.ts, src/b.ts",
    );
    expect(followUpAfterUnrelated.lines).toContain("- focus-failed-files: ");
  });

  it("preserves two-file partial failure across auto-compact, process reload, /continue, and a later non-mutation turn", () => {
    const seed = runFixture("seed", "partial");
    expect(seed.compacted).toBe(true);
    expect(seed.compactReason).toBe("auto-threshold");
    expect(seed.sourceTurnCount).toBe(12);
    expect(seed.snapshot.lastTerminalClassification).toBe("stopped");
    expect(seed.snapshot.lastFailure).toBe(partialStopReason);
    expect(seed.snapshot.recentChangedFiles).toEqual(["src/a.ts"]);
    expect(seed.snapshot.recentVerifiedFiles).toEqual(["src/a.ts"]);
    expect(seed.snapshot.recentFailedFiles).toEqual([
      { path: "src/b.ts", reason: "write failed: EACCES" },
    ]);
    expect(seed.snapshot.lastVerificationBlockerKind).toBe(
      "partial-mutation-failed",
    );
    expect(seed.snapshot.lastVerificationNextAction).toBe(partialNextAction);
    expect(seed.snapshot.lastWriterStarted).toBe(true);
    expect(seed.snapshot.lastWriteEffect).toBe("unknown");
    expect(seed.snapshot.lastWriteRequiresUserInspection).toBe(true);
    expect(seed.context).toContain("- last-terminal: stopped (stopped_error)");
    expect(seed.context).toContain("- recent-changed-files: src/a.ts");
    expect(seed.context).toContain(
      "- recent-failed-files: src/b.ts (write failed: EACCES)",
    );
    expect(seed.context).toContain(
      "- last-verification-blocker-kind: partial-mutation-failed",
    );
    expect(seed.context).toContain(
      `- last-verification-next-action: ${partialNextAction}`,
    );
    expect(seed.context).not.toContain("- recent-changed-files: src/a.ts, src/b.ts");
    expect(seed.context).not.toContain("rollback succeeded");
    expect(seed.context).not.toContain("atomic rollback");

    const initialContinue = runFixture("continue", "partial", seed.sessionId);
    const initialSurface = initialContinue.lines.join("\n");
    expect(initialContinue.turns).toHaveLength(1);
    expect(initialSurface).toContain("Continuation");
    expect(initialSurface).toContain("- Outcome: stopped");
    expect(initialSurface).toContain("- BlockerKind: partial-mutation-failed");
    expect(initialSurface).toContain("- Changed files: src/a.ts");
    expect(initialSurface).toContain("- Verified files: src/a.ts");
    expect(initialSurface).toContain(
      "- Failed files: src/b.ts (write failed: EACCES)",
    );
    expect(initialSurface).toContain("- Writer started: yes");
    expect(initialSurface).toContain("- Write effect: unknown");
    expect(initialSurface).toContain("- Requires inspection: yes");
    expect(initialSurface).toContain(`- DoNext: ${partialNextAction}`);
    expect(initialSurface).toContain("- Rollback: not attempted");
    expect(initialSurface).toContain("FOCUSED_CONTINUATION_QUERY");
    expect(initialSurface).toContain("- focus-terminal: stopped");
    expect(initialSurface).toContain("- focus-changed-files: src/a.ts");
    expect(initialSurface).toContain(
      "- focus-failed-files: src/b.ts (write failed: EACCES)",
    );
    expect(initialSurface).toContain(
      "- focus-blocker-kind: partial-mutation-failed",
    );
    expect(initialSurface).toContain(`- focus-next-action: ${partialNextAction}`);
    expect(initialSurface).toContain("- focus-rollback: not attempted");
    expect(initialSurface).toContain("- focus-atomicity: not claimed");
    expect(initialSurface).not.toContain("- Outcome: success");
    expect(initialSurface).not.toContain("Changed files: src/a.ts, src/b.ts");
    expect(initialSurface).not.toContain("rollback succeeded");
    expect(initialSurface).not.toContain("atomic rollback");

    const afterUnrelated = runFixture(
      "append-unrelated",
      "partial",
      seed.sessionId,
    );
    expect(afterUnrelated.snapshot.lastTerminalClassification).toBe("stopped");
    expect(afterUnrelated.snapshot.recentChangedFiles).toEqual(["src/a.ts"]);
    expect(afterUnrelated.snapshot.recentFailedFiles).toEqual([
      { path: "src/b.ts", reason: "write failed: EACCES" },
    ]);
    expect(afterUnrelated.snapshot.lastVerificationBlockerKind).toBe(
      "partial-mutation-failed",
    );
    expect(afterUnrelated.context).toContain("- last-terminal: stopped (stopped_error)");
    expect(afterUnrelated.context).toContain("- recent-changed-files: src/a.ts");
    expect(afterUnrelated.context).toContain(
      "- recent-failed-files: src/b.ts (write failed: EACCES)",
    );

    const followUpAfterUnrelated = runFixture(
      "continue",
      "partial",
      seed.sessionId,
    );
    const followUpSurface = followUpAfterUnrelated.lines.join("\n");
    expect(followUpAfterUnrelated.turns).toHaveLength(1);
    expect(followUpSurface).toContain("FOCUSED_CONTINUATION_QUERY");
    expect(followUpSurface).toContain("- focus-terminal: stopped");
    expect(followUpSurface).toContain("- focus-changed-files: src/a.ts");
    expect(followUpSurface).toContain(
      "- focus-failed-files: src/b.ts (write failed: EACCES)",
    );
    expect(followUpSurface).toContain(
      "- focus-blocker-kind: partial-mutation-failed",
    );
    expect(followUpSurface).toContain(`- focus-next-action: ${partialNextAction}`);
    expect(followUpSurface).toContain("- focus-rollback: not attempted");
    expect(followUpSurface).toContain("- focus-atomicity: not claimed");
    expect(followUpSurface).not.toContain("- focus-terminal: success");
    expect(followUpSurface).not.toContain("focus-changed-files: src/a.ts, src/b.ts");
    expect(followUpSurface).not.toContain("rollback succeeded");
    expect(followUpSurface).not.toContain("atomic rollback");
  });
});

const partialStopReason =
  "apply_patch multi-file workspace write stopped before success: src/b.ts failed after src/a.ts was verified.";
const partialNextAction = "Inspect/re-read both attempted files before retrying.";

type FixtureMode = "seed" | "append-unrelated" | "continue";
type FixtureScenario = "success" | "partial";

interface FixtureOutput {
  readonly compacted?: boolean;
  readonly compactReason?: string;
  readonly sourceTurnCount?: number;
  readonly sessionId: string;
  readonly snapshot: {
    readonly lastTerminalClassification?: string;
    readonly lastFailure?: string;
    readonly recentChangedFiles: readonly string[];
    readonly recentVerifiedFiles: readonly string[];
    readonly recentFailedFiles: ReadonlyArray<{ path: string; reason: string }>;
    readonly lastVerificationBlockerKind?: string;
    readonly lastVerificationNextAction?: string;
    readonly lastWriterStarted?: boolean;
    readonly lastWriteEffect?: string;
    readonly lastWriteRequiresUserInspection?: boolean;
  };
  readonly context?: string;
  readonly lines: readonly string[];
  readonly turns: readonly unknown[];
}

function runFixture(
  mode: FixtureMode,
  scenario: FixtureScenario,
  sessionId?: string,
): FixtureOutput {
  const repoRoot = path.resolve(process.cwd(), "../..");
  const tsxCli = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const fixturePath = path.join(
    process.cwd(),
    "src",
    "test-utils",
    "longSessionDurabilityProcess.ts",
  );
  const result = spawnSync(
    process.execPath,
    [tsxCli, fixturePath, mode, scenario, ...(sessionId ? [sessionId] : [])],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: fakeHome,
        USERPROFILE: fakeHome,
        CHEERS_REAL_HOME: "",
        CHEERS_REAL_PROVIDER_SMOKE: "",
      },
      encoding: "utf8",
    },
  );

  expect(result.status, result.stderr || result.stdout).toBe(0);
  expect(result.stderr.trim()).toBe("");
  const output = JSON.parse(result.stdout) as FixtureOutput;
  expect(output.sessionId).toBeTruthy();
  return {
    ...output,
    lines: output.lines ?? [],
    turns: output.turns ?? [],
  };
}
