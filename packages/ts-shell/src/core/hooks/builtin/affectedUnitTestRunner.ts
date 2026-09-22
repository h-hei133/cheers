import { existsSync } from "node:fs";
import path from "node:path";
import type { InProcessHookConfig, PostToolUsePayload } from "../types.js";

/**
 * Built-in Verification Hook: Affected Unit Test Runner
 * Automatically detects if a modified source file has a corresponding test file
 * and logs it as a targeted verification candidate.
 */
export function createAffectedUnitTestRunner(): InProcessHookConfig {
  return {
    event: "PostToolUse",
    name: "affected-unit-test-runner",
    matcher: "write|edit",
    description: "Identifies corresponding unit test suites for modified source files.",
    handler: async (payload) => {
      const p = payload as PostToolUsePayload;
      if (!p.success || !p.args.path) {
        return null;
      }

      const filePath = typeof p.args.path === "string" ? p.args.path : "";
      if (filePath.endsWith(".test.ts") || filePath.endsWith(".spec.ts")) {
        return null;
      }

      // Check candidate test file locations
      const ext = path.extname(filePath);
      const base = filePath.slice(0, -ext.length);
      const candidate1 = `${base}.test${ext}`;
      const candidate2 = `${base}.spec${ext}`;
      const candidate3 = path.join(path.dirname(filePath), "__tests__", `${path.basename(base)}.test${ext}`);

      const fullCandidate1 = path.resolve(p.workspaceRoot, candidate1);
      const fullCandidate2 = path.resolve(p.workspaceRoot, candidate2);
      const fullCandidate3 = path.resolve(p.workspaceRoot, candidate3);

      let matchedTestFile = "";
      if (existsSync(fullCandidate1)) {
        matchedTestFile = candidate1;
      } else if (existsSync(fullCandidate2)) {
        matchedTestFile = candidate2;
      } else if (existsSync(fullCandidate3)) {
        matchedTestFile = candidate3;
      }

      if (matchedTestFile) {
        return {
          decision: "allow",
          hookSpecificOutput: {
            affectedUnitTest: matchedTestFile,
            recommendation: `Run targeted test suite: \`npx vitest run ${matchedTestFile}\``,
          },
        };
      }

      return null;
    },
  };
}
