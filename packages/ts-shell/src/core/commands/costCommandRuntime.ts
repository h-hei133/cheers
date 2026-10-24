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
  context.signal?.throwIfAborted();
  const refused = context.admission?.();
  context.signal?.throwIfAborted();
  if (refused) return { kind: 'local', output: refused };
  const catalog = context.readConfiguration?.().catalog ?? loadCatalog();
  context.signal?.throwIfAborted();
  const report = costReport(costModel(getSessionUsage(context.sessionId ?? ""), catalog), context.cwd);
  return { kind: "local", output: reportText(report), report };
}
