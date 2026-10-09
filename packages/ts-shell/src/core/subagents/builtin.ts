import type { SubagentDefinition } from "./types.js";
export const BUILTIN_SUBAGENTS: SubagentDefinition[] = [
  {
    name: "Explore",
    description: "Fast read-only codebase exploration and file search specialist.",
    systemPrompt: "You are Explore, a fast read-only research agent. Discover files, read code, and search symbols to answer the query.",
    tools: ["read", "grep", "glob", "lsp"],
    disallowedTools: ["write", "edit", "rm", "eval"],
    permissionMode: "plan",
    source: "builtin",
  },
  {
    name: "Plan",
    description: "Architectural research and implementation planning specialist.",
    systemPrompt: "You are Plan, an architectural planning agent. Research the codebase and produce clear, phased execution plans.",
    tools: ["read", "grep", "glob", "lsp", "todo"],
    disallowedTools: ["write", "edit"],
    permissionMode: "plan",
    source: "builtin",
  },
  {
    name: "general-purpose",
    description: "Capable agent for complex multi-step coding, refactoring, and debugging tasks.",
    systemPrompt: "You are a general-purpose autonomous coding subagent. Execute multi-step implementation tasks and report your findings.",
    tools: ["read", "write", "edit", "grep", "glob", "lsp", "bash"],
    permissionMode: "default",
    source: "builtin",
  },
  {
    name: "code-reviewer",
    description: "Expert code review specialist. Proactively reviews code changes for quality, security, and maintainability.",
    systemPrompt: "You are a senior code reviewer. Analyze diffs and source code, flagging bugs, security vulnerabilities, and anti-patterns with actionable recommendations.",
    tools: ["read", "grep", "glob", "lsp", "bash"],
    disallowedTools: ["write", "edit"],
    permissionMode: "plan",
    source: "builtin",
  },
];
