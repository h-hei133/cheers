import { DISCOVERY_LOAD_TOOL, DISCOVERY_SEARCH_TOOL } from "../core/tools/discovery/state.js";
import type { SyntheticToolIntent } from "./synthetic.js";

/**
 * Commands a synthetic run may be asked to carry out, mapped from the phrase a
 * prompt uses to the shell command it means. Only consulted when
 * `CHEERS_SYNTHETIC_TOOLS` is set, so an ordinary synthetic run keeps
 * answering in prose.
 */
const SYNTHETIC_TOOL_INTENTS = [
  {
    phrase: "node version",
    name: "bash",
    args: () => ({ command: "node --version" }),
  },
  {
    phrase: "node --version",
    name: "bash",
    args: () => ({ command: "node --version" }),
  },
  {
    phrase: "read the first line from ",
    name: "read",
    args: (prompt: string) => ({
      path: prompt.slice(prompt.toLowerCase().indexOf("read the first line from ") + "read the first line from ".length).trim(),
      limit: 1,
    }),
  },
  {
    phrase: "create file ",
    name: "write",
    args: (prompt: string) => {
      const match = /^create file (.+?) with content:\s*([\s\S]+)$/i.exec(prompt.trim());
      return match ? { path: match[1]!.trim(), content: match[2]!.trim() } : {};
    },
  },
  {
    phrase: "apply patch to ",
    name: "apply_patch",
    args: (prompt: string) => {
      const match = /^apply patch to (.+?) replacing ([\s\S]+?) with ([\s\S]+)$/i.exec(prompt.trim());
      if (!match) return {};
      return {
        input: [
          "*** Begin Patch",
          `*** Update File: ${match[1]!.trim()}`,
          "@@",
          `-${match[2]!.trim()}`,
          `+${match[3]!.trim()}`,
          "*** End Patch",
        ].join("\n"),
      };
    },
  },
  {
    phrase: "discover and load skill ",
    name: DISCOVERY_SEARCH_TOOL,
    args: () => ({ query: "skill", limit: 5 }),
    sequence: (prompt: string) => {
      const prefix = "discover and load skill ";
      const skill = prompt.slice(prompt.toLowerCase().indexOf(prefix) + prefix.length).trim();
      return [
        { name: DISCOVERY_SEARCH_TOOL, args: { query: "skill", limit: 5 } },
        { name: DISCOVERY_LOAD_TOOL, args: { names: ["skill"] } },
        { name: "skill", args: { name: skill } },
      ];
    },
  },
  {
    phrase: "delegate task ",
    name: "task",
    args: (prompt: string) => ({
      description: "Synthetic delegated task",
      prompt: prompt.slice(prompt.toLowerCase().indexOf("delegate task ") + "delegate task ".length).trim(),
      subagent_type: "general-purpose",
      agentMode: "plan",
      isolation: "none",
    }),
  },
  {
    phrase: "run ",
    name: "bash",
    args: (prompt: string) => ({ command: prompt.replace(/^run\s+/i, "").trim() }),
  },
] as const;

export function syntheticToolIntent(): readonly SyntheticToolIntent[] | undefined {
  if (process.env.CHEERS_SYNTHETIC_TOOLS !== "1") return undefined;
  return SYNTHETIC_TOOL_INTENTS.map(intent => ({ ...intent }));
}

