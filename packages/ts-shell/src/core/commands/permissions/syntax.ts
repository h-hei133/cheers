import type { CommandSyntax } from "../syntax/model.js";
import { parseSyntax } from "../syntax/parse.js";

export const permissionsSyntax: CommandSyntax = {
  name: "permissions", defaultAction: "list", flags: [],
  actions: [
    { name: "list", aliases: ["status"], summary: "list current project grants" },
    { name: "explain", summary: "explain the last automatic approval" },
    { name: "revoke", aliases: ["remove"], summary: "revoke one matching grant", parameters: [{ name: "index|scope-key|label", kind: "text", required: true }] },
    { name: "reset", aliases: ["clear"], summary: "clear current project grants, or all grants explicitly", parameters: [{ name: "scope", kind: "text", values: ["all"] }] },
  ],
};

export function parsePermissionsArgs(args: readonly string[]) {
  const action = args[0]?.toLowerCase();
  const normalized = args.map((value, index) => index === 1 && (action === "reset" || action === "clear") ? value.toLowerCase() : value);
  return parseSyntax(permissionsSyntax, normalized);
}
