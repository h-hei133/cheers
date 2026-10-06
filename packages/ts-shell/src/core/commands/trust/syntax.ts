import type { ProjectTrustLevel } from "../../security/projectTrust.js";
import type { CommandAction, CommandSyntax } from "../syntax/model.js";

interface TrustAction extends CommandAction {
  readonly level?: ProjectTrustLevel;
}

export const trustSyntax: CommandSyntax<TrustAction> = {
  name: "trust",
  defaultAction: "status",
  actions: [
    { name: "status", summary: "show project resources and the current trust decision" },
    { name: "on", summary: "allow this project's MCP servers, hooks and workflow steps", level: "trusted" },
    { name: "off", summary: "refuse this project's resources", level: "untrusted" },
    { name: "session", summary: "allow project resources for this process", level: "session-only" },
  ],
};
