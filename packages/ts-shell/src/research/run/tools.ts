import type { ToolDefinition } from '../../tools/types.js';
import { readOnlyTool } from '../../core/tools/capability.js';
import { createPaperSearchTool } from '../sources/papers.js';
import { createDocumentReadTool } from '../sources/document.js';
import { researchSaveTool } from '../report/save.js';
import type { ResearchRuntime } from './runtime.js';

export function researchTools(runtime?: ResearchRuntime, runId?: unknown): readonly ToolDefinition[] {
  const sourceTools = [createPaperSearchTool(), createDocumentReadTool()];
  const run = runtime?.selected(runId);
  if (!run) return sourceTools;
  const execute = readOnlyTool({ name: 'research_run', description: 'Execute the exact user-armed durable research run through sequential native read-only stages and independent adversarial review. Uses the current shared request ledger; cannot authorize shell, writes, nested tasks or new runs. Returns truthful partial/cancelled outcomes and validated citations.',
    argsSchema: { type: 'object', additionalProperties: false, required: ['runId'], properties: { runId: { const: run.id } } },
    async execute(args, context) {
      if (args.runId !== run.id) return { success: false, error: 'Research run identity changed.' };
      try {
        const final = await runtime!.run(run.id, context);
        const notice = `Research ${final.id}: ${final.status}; independent review ${final.review?.status ?? 'not-run'}; save ${final.save.status}. Use /deep-research dump for the complete native report. ${final.request.save ? 'Only research_save with ordinary write approval can save this report.' : 'No report save was requested.'}`;
        return { success: final.status === 'completed' || final.status === 'partial', output: runtime!.snapshot(),
          metadata: { research: { runId: final.id, status: final.status, review: final.review?.status ?? 'not-run', save: final.save.status }, outputNotice: notice } };
      } catch { return { success: false, error: 'Research did not finish a verified native run. Inspect /deep-research status before retrying.' }; }
    } }, { delegation: true });
  return [...sourceTools, execute, ...(run.save.requested ? [researchSaveTool(runtime!, run.id)] : [])];
}
