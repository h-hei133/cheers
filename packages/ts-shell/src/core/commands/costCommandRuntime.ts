import { rejectArguments } from "./syntax/empty.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { getSessionUsage } from "../../observability/usageTelemetry.js";
import { loadCatalog } from "../models/catalogStore.js";
import { costModel } from "./cost/model.js";
import { costReport } from "./cost/report.js";
import { reportText } from "./report/projection.js";

/** Resolve one accepted rate snapshot for all recorded provider/model buckets. */
export async function runCostCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const invalid = rejectArguments("cost", args);
  if (invalid) return invalid;
  const catalog = context.readConfiguration?.().catalog ?? loadCatalog();
  const report = costReport(costModel(getSessionUsage(context.sessionId ?? ""), catalog));
  return { kind: "local", output: reportText(report), report };
}
