import type { CommandSyntax } from "../syntax/model.js";

export const metricsSyntax: CommandSyntax = {
  name: "metrics", defaultAction: "", flags: [{ name: "run", kind: "text", summary: "show metrics for a captured run ID" }],
  actions: [{ name: "", summary: "aggregate recent metric records (default 2000)", parameters: [{ name: "records", kind: "integer", minimum: 1 }] }],
};
