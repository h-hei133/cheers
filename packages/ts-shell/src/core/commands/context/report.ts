import { contextPressure } from '../../models/pressure.js';
import type { ResolvedContextWindow } from '../../models/window.js';
import type { ReportLine } from '../report/contract.js';
import { createReport, span } from '../report/projection.js';
import type { RequestContext, TextSize } from '../../../context/request/model.js';
import { CHARS_PER_TOKEN } from '../../../session/context.js';
import { requestDetails } from './request.js';

export function contextReport(input: {
  readonly resolution: ResolvedContextWindow;
  readonly used: number | undefined;
  /** Whether the measurement describes the current request identity. */
  readonly measurement?: 'measured' | 'stale' | 'unknown';
  readonly reserve: number;
  readonly schemaTokens: number;
  readonly schemaSize?: TextSize;
  readonly request?: RequestContext;
  readonly toolCount: number;
  readonly totalTokens: number;
  readonly turns: number;
}) {
  const { resolution, used, reserve, schemaTokens, toolCount } = input;
  const measurement = input.measurement ?? (used === undefined ? 'unknown' : 'measured');
  const window = resolution.window;
  const free = used === undefined ? undefined : Math.max(0, window - used - reserve);
  const compactAt = Math.max(0, window - reserve);
  const lines: ReportLine[] = [
    { kind: 'text', bullet: true, spans: [span('Window: '), span(window.toLocaleString(), 'number'),
      span(` tokens (${resolution.source === 'default' ? 'assumed default' : resolution.source})`)] },
    ...(resolution.warning ? [{ kind: 'text' as const, bullet: true, spans: [span(`Warning: ${resolution.warning}`, 'warning')] }] : []),
  ];
  if (used === undefined) {
    lines.push({ kind: 'text', bullet: true, spans: [span('Current tool schema estimate: '),
      span(`~${schemaTokens.toLocaleString()}`, 'number'), span(` tokens (${toolCount} tools)`)] },
    { kind: 'space' }, { kind: 'text', spans: [span(measurement === 'stale'
      ? 'The last provider measurement belongs to a different model, endpoint or schema, so it is not the current context. No current measurement is available.'
      : 'Current prompt usage is unknown. No provider measurement is available for this context.')] },
    { kind: 'text', spans: [span('First request estimate: at least '), span(`~${schemaTokens.toLocaleString()}`, 'number'),
      span(' tokens from the current tool schemas. Conversation tokens are not estimated before a request is sent.')] });
  } else {
    lines.push({ kind: 'text', bullet: true, spans: [...bar(used, reserve, window), span('  '),
      span(`${((used / window) * 100).toFixed(1)}%`, `context-${contextPressure(used, window)}`), span(' used')] },
    { kind: 'text', bullet: true, spans: [span('Latest context measurement: '), span(used.toLocaleString(), 'number'),
      span(' of '), span(window.toLocaleString(), 'number'), span(' tokens; '), span(free!.toLocaleString(), 'number'),
      span(' free before the '), span(reserve.toLocaleString(), 'number'), span('-token reserve')] },
    { kind: 'space' },
    { kind: 'columns', cells: [[span('Current tool schemas')], [span(`~${schemaTokens.toLocaleString()}`, 'number')],
      [span(`${toolCount} current definitions; character-based estimate`)]] },
    { kind: 'columns', cells: [[span('Context input usage')], [span(used.toLocaleString(), 'number')], [span('reported by the provider')]] },
    { kind: 'space' },
    { kind: 'text', spans: [span('Auto-compaction runs when a request would exceed about '), span(compactAt.toLocaleString(), 'number'),
      span(' tokens. '), span('/compact', 'command'), span(' runs it now.')] });
    if (input.totalTokens > 0) lines.push({ kind: 'space' }, { kind: 'text', spans: [span('Across the whole session: '),
      span(input.totalTokens.toLocaleString(), 'number'), span(' tokens over '), span(input.turns, 'number'), span(input.turns === 1 ? ' turn.' : ' turns.')] });
  }
  lines.push({ kind: 'text', spans: [span('The context gauge can include delegated requests. The foreground request below is captured separately.')] });
  if (input.schemaSize) lines.push({ kind: 'space' }, { kind: 'text', spans: [span(
    `Current tool definitions: ${input.schemaSize.bytes.toLocaleString()} UTF-8 bytes, ${input.schemaSize.codeUnits.toLocaleString()} UTF-16 code units of JSON; estimate divides code units by ${CHARS_PER_TOKEN}.`,
  )] });
  const request = requestDetails(input.request);
  lines.push(...request.lines);
  return createReport({ title: 'Context window',
    columns: [{ label: 'What', minWidth: 20 }, { label: 'Value', align: 'right', minWidth: 8 }, { label: 'How it is known', minWidth: 24 }],
    lines, facts: { window: { tokens: window, source: resolution.source, warning: resolution.warning ?? null },
      prompt: used === undefined ? { status: measurement === 'stale' ? 'stale' : 'unknown',
        estimate: { status: 'estimated', tokens: schemaTokens, basis: 'current-tool-schemas' } }
        : { status: 'measured', tokens: used },
      reserveTokens: reserve, freeTokens: free ?? null, compactAtTokens: compactAt,
      toolSchemas: { status: 'estimate', method: 'characters', tokens: schemaTokens, toolCount,
        characterUnit: 'utf16-code-units', divisor: CHARS_PER_TOKEN, size: input.schemaSize ? { ...input.schemaSize } : null },
      request: request.facts,
      session: { recordedTokens: input.totalTokens, recordedTurns: input.turns } },
  });
}

function bar(used: number, reserve: number, window: number) {
  const usedCells = Math.min(32, Math.round((used / window) * 32));
  const reserveCells = Math.min(32 - usedCells, Math.round((reserve / window) * 32));
  return [span('█'.repeat(usedCells), 'emphasis'),
    span('▒'.repeat(reserveCells), 'subtle'), span('░'.repeat(32 - usedCells - reserveCells), 'muted')];
}
