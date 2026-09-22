import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /init (aliases: /setup)
 * Scans project manifests to inspect frameworks, package managers, and test commands, proposing a tailored AGENTS.md / CLAUDE.md.
 */
export async function runInitCommand(
  _args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const root = context.cwd || process.cwd();
  const detected: string[] = [];
  let packageManager = "npm";
  let testCommand = "npm test";
  let buildCommand = "npm run build";

  if (existsSync(path.join(root, "pnpm-lock.yaml"))) {
    packageManager = "pnpm";
    testCommand = "pnpm test";
    buildCommand = "pnpm run build";
    detected.push("- Package Manager: pnpm");
  } else if (existsSync(path.join(root, "bun.lock")) || existsSync(path.join(root, "bun.lockb"))) {
    packageManager = "bun";
    testCommand = "bun test";
    buildCommand = "bun run build";
    detected.push("- Package Manager: bun");
  } else if (existsSync(path.join(root, "yarn.lock"))) {
    packageManager = "yarn";
    testCommand = "yarn test";
    buildCommand = "yarn build";
    detected.push("- Package Manager: yarn");
  } else if (existsSync(path.join(root, "package.json"))) {
    detected.push("- Package Manager: npm");
  }

  if (existsSync(path.join(root, "package.json"))) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
      if (pkg.name) detected.push(`- Project Name: ${pkg.name}`);
      if (pkg.workspaces) detected.push("- Workspace Type: Monorepo (npm/pnpm workspaces)");
      if (pkg.scripts?.test) testCommand = `${packageManager} test`;
      if (pkg.scripts?.build) buildCommand = `${packageManager} run build`;
    } catch {
      // Ignore parse failure
    }
  }

  if (existsSync(path.join(root, "Cargo.toml"))) {
    detected.push("- Language: Rust (Cargo.toml detected)");
    testCommand = "cargo test";
    buildCommand = "cargo build";
  }

  if (existsSync(path.join(root, "pyproject.toml")) || existsSync(path.join(root, "requirements.txt"))) {
    detected.push("- Language: Python (pyproject.toml/requirements.txt detected)");
    testCommand = "pytest";
  }

  if (existsSync(path.join(root, "tsconfig.json"))) {
    detected.push("- Language: TypeScript (tsconfig.json detected)");
  }

  const agentsExists = existsSync(path.join(root, "AGENTS.md"));
  const claudeExists = existsSync(path.join(root, "CLAUDE.md"));

  const lines: string[] = [
    "# Project Initialization & Architecture Inspection (/init)",
    "",
    "## Detected Project Environment:",
    ...detected,
    "",
    "## Recommended Configuration Guidelines:",
    `- **Build Command**: \`${buildCommand}\``,
    `- **Test Command**: \`${testCommand}\``,
    `- **AGENTS.md Status**: ${agentsExists ? "Already exists (up to date)" : "Not found - recommend creating"}`,
    `- **CLAUDE.md Status**: ${claudeExists ? "Already exists (up to date)" : "Not found - recommend creating"}`,
    "",
    "To establish rules for coding agents in this repo, ensure `AGENTS.md` defines your architectural invariants, boundaries, and validation commands.",
  ];

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}
