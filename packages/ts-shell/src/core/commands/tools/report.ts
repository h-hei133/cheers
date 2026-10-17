import type { ToolDefinition } from '../../../tools/types.js';
import { toolPlanMode } from '../../query/toolPolicy.js';
import type { CommandReport, ReportLine } from '../report/contract.js';
import { createReport, span } from '../report/projection.js';

const PERMISSIONS = "Eligible tools still require the session's permissions and approval.";

export function toolsReport(pool: ReadonlyMap<string, ToolDefinition>): CommandReport {
  const tools = [...pool.values()].sort((a, b) => a.name.localeCompare(b.name));
  const measured = tools.map(tool => ({ name: tool.name, descriptionBytes: Buffer.byteLength(tool.description, 'utf8'),
    schemaBytes: Buffer.byteLength(JSON.stringify(tool.argsSchema), 'utf8') }));
  return createReport({ title: `Tools (${tools.length})`,
    columns: [{ label: 'Tool', minWidth: 14 }, { label: 'Plan mode', minWidth: 10 }, { label: 'What it does', minWidth: 24 }],
    lines: [
      ...tools.map((tool): ReportLine => ({ kind: 'columns', cells: [
        [span(tool.name, 'code')], [span(toolPlanMode(tool.name, tool))], [span(toolSummary(tool.description))],
      ] })),
      { kind: 'space' },
      { kind: 'text', spans: [span('/tools <name>', 'command'), span(" shows one tool's arguments.")] },
      { kind: 'text', spans: [span('Plan mode permits only read-only bash commands and browser actions.')] },
      { kind: 'text', spans: [span(PERMISSIONS, 'warning')] },
    ],
    facts: { count: tools.length, tools: tools.map(tool => ({ name: tool.name,
      description: tool.description, planMode: toolPlanMode(tool.name, tool) })), permission: 'not-evaluated',
      // Static wire cost only; a token count requires the model's tokenizer.
      size: { unit: 'utf8-bytes', tokens: 'not-measured',
        descriptionBytes: measured.reduce((sum, tool) => sum + tool.descriptionBytes, 0),
        schemaBytes: measured.reduce((sum, tool) => sum + tool.schemaBytes, 0), perTool: measured } },
  });
}

/** Snapshot only documentation fields, never executable callbacks or defaults. */
export function toolReport(tool: ToolDefinition): CommandReport {
  const properties = tool.argsSchema.properties;
  const required = new Set(Array.isArray(tool.argsSchema.required) ? tool.argsSchema.required : []);
  const args = properties && typeof properties === 'object' && !Array.isArray(properties)
    ? Object.entries(properties).map(([name, value]) => {
      const shape = value && typeof value === 'object' ? value as { type?: unknown; description?: unknown } : {};
      return { name, type: typeof shape.type === 'string' ? shape.type : 'any', required: required.has(name),
        description: typeof shape.description === 'string' ? shape.description : '' };
    }) : [];
  const planMode = toolPlanMode(tool.name, tool);
  return createReport({ title: tool.name,
    columns: [{ label: 'Argument', minWidth: 14 }, { label: 'Type', minWidth: 8 },
      { label: 'Required', minWidth: 8 }, { label: 'Description', minWidth: 24 }],
    lines: [
      ...tool.description.trim().split(/\r?\n/).map((text): ReportLine => ({ kind: 'text', spans: [span(text)] })),
      { kind: 'space' },
      { kind: 'text', spans: [span('Plan mode: '), span(planMode, planMode === 'blocked' ? 'warning' : 'text')] },
      { kind: 'text', spans: [span(PERMISSIONS, 'warning')] },
      { kind: 'space' },
      ...(args.length ? args.map((arg): ReportLine => ({ kind: 'columns', cells: [
        [span(arg.name, 'argument')], [span(arg.type, 'code')], [span(arg.required ? 'yes' : 'no')], [span(arg.description)],
      ] })) : [{ kind: 'text' as const, spans: [span('No top-level arguments are declared.')] }]),
    ],
    facts: { name: tool.name, description: tool.description, planMode, arguments: args, permission: 'not-evaluated' },
  });
}

/** Abbreviations do not end the first sentence of a tool's list description. */
export function toolSummary(description: string): string {
  const flat = description.replace(/\s+/g, ' ').trim();
  let from = 0;
  for (;;) {
    const stop = flat.indexOf('. ', from);
    if (stop < 0) break;
    if (!/\b(?:e\.g|i\.e|etc|vs|cf|no)\.$/i.test(flat.slice(0, stop + 1))) return trim(flat.slice(0, stop + 1));
    from = stop + 2;
  }
  return trim(flat);
}

function trim(text: string): string {
  return text.length > 110 ? `${text.slice(0, 109)}…` : text;
}
