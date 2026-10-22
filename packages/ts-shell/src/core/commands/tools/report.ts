import type { ToolDefinition } from '../../../tools/types.js';
import { toolPlanMode } from '../../query/toolPolicy.js';
import type { CommandReport, ReportLine } from '../report/contract.js';
import { createReport, span } from '../report/projection.js';
import { reportMetadata } from '../report/metadata.js';
import { compareDiscoveryCost } from '../../tools/discovery/evaluation.js';
import { toolWireSurface } from '../../../provider/endpoints/toolSurface.js';

const PERMISSIONS = "Eligible tools still require the session's permissions and approval.";

/** Display canonicalization precedes scrubbing so removed ANSI cannot join secret fragments. */
function metadataText(value: string, projectRoot: string, maxLength = 4096, preserveLines = false): string {
  return reportMetadata(value, projectRoot, maxLength, preserveLines);
}

export function toolLabel(name: string, projectRoot = process.cwd()): string {
  return metadataText(name, projectRoot, 240);
}

export function toolsReport(
  pool: ReadonlyMap<string, ToolDefinition>,
  projectRoot = process.cwd(),
  endpoint = 'openai-compatible',
): CommandReport {
  const safe = (value: string, maxLength = 4096): string => metadataText(value, projectRoot, maxLength);
  const tools = [...pool.values()].sort((a, b) => a.name.localeCompare(b.name));
  const serialize = (values: readonly ToolDefinition[]) => toolWireSurface(values, endpoint);
  const discovery = compareDiscoveryCost({ catalog: pool, serialize });
  const surfaceFacts = (value: typeof discovery.full | null) => value ? {
    tools: value.tools, bytes: value.bytes, characters: value.characters, estimatedTokens: value.estimatedTokens,
  } : null;
  const measured = tools.map(tool => ({ name: tool.name, descriptionBytes: Buffer.byteLength(tool.description, 'utf8'),
    schemaBytes: Buffer.byteLength(JSON.stringify(tool.argsSchema), 'utf8'),
    wireBytes: toolWireSurface([tool], endpoint).bytes }));
  const measurements = new Map(measured.map(item => [item.name, item]));
  return createReport({ title: `Tools (${tools.length})`,
    columns: [{ label: 'Tool', minWidth: 14 }, { label: 'Plan mode', minWidth: 10 },
      { label: 'Description bytes', minWidth: 8, align: 'right' }, { label: 'Schema bytes', minWidth: 8, align: 'right' },
      { label: 'Wire bytes', minWidth: 8, align: 'right' },
      { label: 'What it does', minWidth: 24 }],
    lines: [
      ...tools.map((tool): ReportLine => ({ kind: 'columns', cells: [
        [span(safe(tool.name, 240), 'code')], [span(toolPlanMode(tool.name, tool))],
        [span(measurements.get(tool.name)!.descriptionBytes, 'number')],
        [span(measurements.get(tool.name)!.schemaBytes, 'number')],
        [span(measurements.get(tool.name)!.wireBytes, 'number')],
        [span(toolSummary(tool.description, projectRoot))],
      ] })),
      { kind: 'space' },
      { kind: 'text', spans: [span(`Description + schema payload: ${measured.reduce((sum, tool) => sum + tool.descriptionBytes, 0)} description bytes + ${measured.reduce((sum, tool) => sum + tool.schemaBytes, 0)} schema bytes. Serialized ${endpoint} declarations: ${discovery.full.bytes} UTF-8 bytes. `),
        span('Token counts require the target model tokenizer and are not measured here.', 'muted')] },
      { kind: 'text', spans: [span(`Discovery projection: full ${discovery.full.tools} tools/${discovery.full.bytes} bytes; initial ${discovery.initial.tools} tools/${discovery.initial.bytes} bytes; after load ${discovery.afterLoad ? `${discovery.afterLoad.tools} tools/${discovery.afterLoad.bytes} bytes` : 'not measured'}; ${discovery.discovery.calls} discovery call(s); schema round-trip ${discovery.quality.status}. `),
        span('Estimated tokens use a characters-per-token method, not a model tokenizer.', 'muted')] },
      { kind: 'text', spans: [span('/tools <name>', 'command'), span(" shows one tool's arguments.")] },
      { kind: 'text', spans: [span('Plan mode permits only read-only bash commands and browser actions.')] },
      { kind: 'text', spans: [span(PERMISSIONS, 'warning')] },
    ],
    facts: { count: tools.length, tools: tools.map(tool => ({ name: safe(tool.name, 240),
      description: safe(tool.description), planMode: toolPlanMode(tool.name, tool) })), permission: 'not-evaluated',
      // Static wire cost only; a token count requires the model's tokenizer.
      size: { unit: 'utf8-bytes', tokens: 'not-measured',
        descriptionBytes: measured.reduce((sum, tool) => sum + tool.descriptionBytes, 0),
        schemaBytes: measured.reduce((sum, tool) => sum + tool.schemaBytes, 0), perTool: measured.map(tool => ({ ...tool, name: safe(tool.name, 240) })),
        wire: { endpoint, bytes: discovery.full.bytes, characters: discovery.full.characters,
          estimatedTokens: discovery.full.estimatedTokens },
        discovery: { full: surfaceFacts(discovery.full), initial: surfaceFacts(discovery.initial),
          afterLoad: surfaceFacts(discovery.afterLoad), calls: discovery.discovery.calls,
          discoveryBytes: discovery.discovery.bytes, discoveryCharacters: discovery.discovery.characters,
          discoveryEstimatedTokens: discovery.discovery.estimatedTokens,
          deltaBytes: discovery.delta.bytes, deltaCharacters: discovery.delta.characters,
          deltaEstimatedTokens: discovery.delta.estimatedTokens, method: discovery.method, divisor: discovery.divisor,
          qualityStatus: discovery.quality.status, changed: discovery.quality.changed } } },
  });
}

/** Snapshot only documentation fields, never executable callbacks or defaults. */
export function toolReport(tool: ToolDefinition, projectRoot = process.cwd()): CommandReport {
  const safe = (value: string, maxLength = 4096): string => metadataText(value, projectRoot, maxLength);
  const description = metadataText(tool.description, projectRoot, 48_000, true);
  const properties = tool.argsSchema.properties;
  const required = new Set(Array.isArray(tool.argsSchema.required) ? tool.argsSchema.required : []);
  const args = properties && typeof properties === 'object' && !Array.isArray(properties)
    ? Object.entries(properties).map(([name, value]) => {
      const shape = value && typeof value === 'object' ? value as { type?: unknown; description?: unknown } : {};
      return { name: safe(name, 240), type: typeof shape.type === 'string' ? safe(shape.type, 80) : 'any', required: required.has(name),
        description: typeof shape.description === 'string' ? safe(shape.description) : '' };
    }) : [];
  const planMode = toolPlanMode(tool.name, tool);
  const descriptionBytes = Buffer.byteLength(tool.description, 'utf8');
  const schemaBytes = Buffer.byteLength(JSON.stringify(tool.argsSchema), 'utf8');
  const name = toolLabel(tool.name, projectRoot);
  return createReport({ title: name,
    columns: [{ label: 'Argument', minWidth: 14 }, { label: 'Type', minWidth: 8 },
      { label: 'Required', minWidth: 8 }, { label: 'Description', minWidth: 24 }],
    lines: [
      ...description.split(/\r?\n/).map((text): ReportLine => ({ kind: 'text', spans: [span(text)] })),
      { kind: 'space' },
      { kind: 'text', spans: [span(`Description + schema payload: ${descriptionBytes} description bytes + ${schemaBytes} schema bytes. Token count: not measured.`)] },
      { kind: 'text', spans: [span('Plan mode: '), span(planMode, planMode === 'blocked' ? 'warning' : 'text')] },
      { kind: 'text', spans: [span(PERMISSIONS, 'warning')] },
      { kind: 'space' },
      ...(args.length ? args.map((arg): ReportLine => ({ kind: 'columns', cells: [
        [span(arg.name, 'argument')], [span(arg.type, 'code')], [span(arg.required ? 'yes' : 'no')], [span(arg.description)],
      ] })) : [{ kind: 'text' as const, spans: [span('No top-level arguments are declared.')] }]),
    ],
    facts: { name, description, planMode, arguments: args, permission: 'not-evaluated',
      size: { unit: 'utf8-bytes', tokens: 'not-measured', descriptionBytes, schemaBytes } },
  });
}

/** Abbreviations do not end the first sentence of a tool's list description. */
export function toolSummary(description: string, projectRoot = process.cwd()): string {
  const flat = metadataText(description, projectRoot);
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
