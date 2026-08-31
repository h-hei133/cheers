import fs from "node:fs";
import path from "node:path";

export interface ToolPromptInfo {
  readonly name: string;
  readonly promptSnippet?: string;
  readonly promptGuidelines?: readonly string[];
}

export interface BuildSystemPromptOptions {
  readonly workspaceRoot: string;
  readonly agentMode?: "plan" | "build";
  readonly tools?: readonly ToolPromptInfo[];
  readonly customInstructions?: string;
}

/**
 * Modular System Prompt Assembly Engine
 *
 * Assembles system prompts in strict deterministic layers:
 * 1. Base persona and operational rules
 * 2. Mode declaration (Plan vs Build)
 * 3. Tool catalog & auto-extracted prompt snippets
 * 4. Deduplicated tool guidelines
 * 5. Project context (<project_context> from AGENTS.md)
 * 6. Dynamic CWD invariant tail
 */
export function buildSystemPrompt(options: BuildSystemPromptOptions): string {
  const sections: string[] = [];

  // Layer 1: Base Persona & Role
  sections.push(
    "You are an expert autonomous coding agent operating inside a terminal workspace.",
    "Your goal is to inspect codebases, formulate plans, execute edits, run commands, and verify changes with high engineering rigor.",
  );

  // Layer 2: Operating Mode
  if (options.agentMode === "plan") {
    sections.push(
      "PLAN MODE ACTIVE: You have full access to inspect files, search symbols via LSP, run safe read-only commands (like git status, git diff) via bash, and explore websites via browser and web tools, but cannot modify files. Produce a structured execution plan based on real file contents.",
    );
  } else {
    sections.push(
      "BUILD MODE ACTIVE: You have full access to inspect, search, execute, browse, and edit files to accomplish the user's task.",
    );
  }

  // Layer 3: Tool Catalog with Snippets
  if (options.tools && options.tools.length > 0) {
    const snippets = options.tools
      .filter((t) => t.promptSnippet)
      .map((t) => `- \`${t.name}\`: ${t.promptSnippet}`);

    if (snippets.length > 0) {
      sections.push("Available tools:", snippets.join("\n"));
    }

    // Layer 4: Deduplicated Tool Guidelines
    const guidelinesSet = new Set<string>();
    for (const t of options.tools) {
      for (const g of t.promptGuidelines ?? []) {
        guidelinesSet.add(g);
      }
    }

    if (guidelinesSet.size > 0) {
      sections.push(
        "Tool Usage Guidelines:",
        Array.from(guidelinesSet)
          .map((g) => `- ${g}`)
          .join("\n"),
      );
    }
  }

  // Layer 5: Project Context & Rules (AGENTS.md / CLAUDE.md)
  const projectRules = loadProjectContextRules(options.workspaceRoot);
  if (projectRules) {
    sections.push(projectRules);
  }

  if (options.customInstructions && options.customInstructions.trim()) {
    sections.push(options.customInstructions.trim());
  }

  // Layer 6: Invariant Working Directory
  sections.push(`Current working directory: ${options.workspaceRoot}`);

  return sections.join("\n\n");
}

function loadProjectContextRules(workspaceRoot: string): string | null {
  const candidates = ["AGENTS.md", "CLAUDE.md", ".coding-agents/SYSTEM.md"];
  for (const candidate of candidates) {
    const fullPath = path.join(workspaceRoot, candidate);
    try {
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, "utf8").trim();
        if (content.length > 0) {
          return `<project_context path="${candidate}">\n${content}\n</project_context>`;
        }
      }
    } catch {
      // Best-effort context load
    }
  }
  return null;
}
