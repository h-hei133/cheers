import { contextPressure } from '../../models/pressure.js';
import type { ResolvedContextWindow } from '../../models/window.js';
import type { ReportLine } from '../report/contract.js';
import { createReport, span } from '../report/projection.js';
import type { RequestContext, TextSize } from '../../../context/request/model.js';
import { CHARS_PER_TOKEN } from '../../../session/context.js';
import { requestDetails } from './request.js';
import { reportMetadata } from '../report/metadata.js';
import { requestBudgetThreshold } from '../../../context/request/budget.js';

export function contextReport(input: {
  readonly resolution: ResolvedContextWindow;
  readonly used: number | undefined;
  /** Whether the measurement describes the current request identity. */
  readonly measurement?: 'measured' | 'calibrated' | 'stale' | 'unknown';
  /**
   * Why the live anchor is absent, when the usage history can say.
   *
   * A rebuilt context and an unmeasured request both leave no anchor, but they
   * ask different things of the reader: one is waiting for the next request, the
   * other is a provider report that never arrived. Without this the report could
   * only say "unknown", which reads like a fault.
   */
  readonly promptAnchor?: 'context-reset' | 'usage-gap';
  readonly reserve: number;
  readonly outputTokens?: number;
  readonly inputLimit?: number;
  readonly protocol?: string;
  readonly compactionUnavailable?: string;
  /** Last actual compaction evaluation, separate from the displayed provider measurement. */
  readonly compactionMeasurement?: { readonly source: 'measured' | 'estimated'; readonly reason?: string };
  readonly schemaTokens: number;
  readonly schemaSize?: TextSize;
  readonly request?: RequestContext;
  readonly toolCount: number;
  readonly totalTokens: number;
  readonly turns: number;
}, projectRoot = process.cwd()) {
  const { resolution, used, reserve, schemaTokens, toolCount } = input;
  const measurement = input.measurement ?? (used === undefined ? 'unknown' : 'measured');
  const window = resolution.window;
  const inputCapacity = Math.max(0, Math.min(
    window - (input.outputTokens ?? 0),
    input.inputLimit ?? Number.POSITIVE_INFINITY,
  ));
  const free = used === undefined ? undefined : Math.max(0, inputCapacity - used - reserve);
  const threshold = requestBudgetThreshold({ window, inputLimit: input.inputLimit,
    outputTokens: input.outputTokens, reserveTokens: reserve });
  const compactAt = threshold.tokens;
  const unavailable = input.compactionUnavailable === undefined ? undefined : reportMetadata(input.compactionUnavailable, projectRoot);
  const anchorReason = measurement === 'stale' ? 'request identity changed'
    : input.promptAnchor === 'context-reset' ? 'the context was rebuilt or files were restored'
      : input.promptAnchor === 'usage-gap' ? 'the last request reported no prompt usage'
        : input.turns === 0 ? 'no measured request yet' : 'no usable prompt usage';
  const unknownPrompt = measurement === 'stale'
    ? 'The last provider measurement belongs to a different model, endpoint or schema, so it is not the current context. No current measurement is available.'
    : input.promptAnchor === 'context-reset'
      // A rebuild or a restore invalidates the old number on purpose; saying
      // only "unknown" made correct behaviour read like a missing measurement.
      ? 'Current prompt usage is unknown. The context was rebuilt, or the files it described were restored, so the previous measurement no longer describes it; the next request will establish a new one.'
      : input.promptAnchor === 'usage-gap'
        ? 'Current prompt usage is unknown. The last request left no usable prompt measurement, so no anchor was recorded; the next request will establish one.'
        : 'Current prompt usage is unknown. No provider measurement is available for this context.';
  const compactionMeasurement = input.compactionMeasurement;
  const compactionReason = compactionMeasurement?.source === 'estimated'
    ? reportMetadata(compactionMeasurement.reason ?? 'no usable prompt usage', projectRoot) : undefined;
  const warning = resolution.warning === undefined ? undefined : reportMetadata(resolution.warning, projectRoot);
  const lines: ReportLine[] = [
    { kind: 'text', bullet: true, spans: [span('Window: '), span(window.toLocaleString(), 'number'),
      span(` tokens (${resolution.source === 'default' ? 'assumed default' : resolution.source})`)] },
    ...(warning ? [{ kind: 'text' as const, bullet: true, spans: [span(`Warning: ${warning}`, 'warning')] }] : []),
    ...(unavailable ? [{ kind: 'text' as const, bullet: true, spans: [span(`Auto-compaction unavailable: ${unavailable}`, 'warning')] }] : []),
  ];
  if (used === undefined) {
    lines.push({ kind: 'text', bullet: true, spans: [span('Discoverable tool catalogue estimate: '),
      span(`~${schemaTokens.toLocaleString()}`, 'number'), span(` tokens (${toolCount} tools)`)] },
    { kind: 'space' }, { kind: 'text', spans: [span(unknownPrompt)] },
    { kind: 'text', spans: [span('The inspection catalogue can include deferred tools absent from the next request. Its estimate is not a first-request estimate or a lower bound.')] });
    if (!compactionMeasurement) lines.push({ kind: 'text', spans: [span(`Compaction basis: estimated; provider measurement unavailable (${anchorReason}).`)] });
  } else {
    lines.push({ kind: 'text', bullet: true, spans: [...bar(used, reserve, window), span('  '),
      span(`${((used / window) * 100).toFixed(1)}%`, `context-${contextPressure(used, window)}`), span(' used')] },
    { kind: 'text', bullet: true, spans: [span(measurement === 'calibrated' ? 'Current context (calibrated): ' : 'Latest context measurement: '), span(used.toLocaleString(), 'number'),
      span(' of '), span(window.toLocaleString(), 'number'), span(' tokens; '), span(free!.toLocaleString(), 'number'),
      span(' free before the '), span(reserve.toLocaleString(), 'number'), span('-token reserve')] },
    { kind: 'space' },
    { kind: 'columns', cells: [[span('Discoverable tool catalogue')], [span(`~${schemaTokens.toLocaleString()}`, 'number')],
      [span(`${toolCount} inspection definitions; character-based estimate`)]] },
    { kind: 'columns', cells: [[span('Context input usage')], [span(used.toLocaleString(), 'number')],
      [span(measurement === 'calibrated' ? 'provider measurement plus estimated context changes' : 'reported by the provider')]] });
    if (input.totalTokens > 0) lines.push({ kind: 'space' }, { kind: 'text', spans: [span('Across the whole session: '),
      span(input.totalTokens.toLocaleString(), 'number'), span(' tokens over '), span(input.turns, 'number'), span(input.turns === 1 ? ' turn.' : ' turns.')] });
  }
  if (compactionMeasurement) lines.push({ kind: 'text', spans: [span(compactionMeasurement.source === 'estimated'
    ? `Last compaction check basis: estimated; provider measurement unavailable (${compactionReason}).`
    : 'Last compaction check basis: measured provider usage plus estimated tail.')] });
  if (!unavailable) lines.push({ kind: 'space' },
    { kind: 'text', spans: [span(`Auto-compaction runs when a request ${threshold.inclusive ? 'reaches' : 'would exceed'} about `), span(compactAt.toLocaleString(), 'number'),
      span(' tokens. '), span('/compact', 'command'), span(' runs it now.')] });
  lines.push({ kind: 'text', spans: [span('The context gauge can include delegated requests. The foreground request below is captured separately.')] });
  if (input.schemaSize) lines.push({ kind: 'space' }, { kind: 'text', spans: [span(
    `Inspection tool definitions: ${input.schemaSize.bytes.toLocaleString()} UTF-8 bytes, ${input.schemaSize.codeUnits.toLocaleString()} UTF-16 code units of JSON; catalogue estimate divides code units by ${CHARS_PER_TOKEN}.`,
  )] });
  const request = requestDetails(input.request, projectRoot);
  lines.push(...request.lines);
  return createReport({ title: 'Context window',
    columns: [{ label: 'What', minWidth: 20 }, { label: 'Value', align: 'right', minWidth: 8 }, { label: 'How it is known', minWidth: 24 }],
    lines, facts: { window: { tokens: window, source: resolution.source, warning: warning ?? null },
      prompt: used === undefined ? { status: measurement === 'stale' ? 'stale' : 'unknown',
        ...(measurement === 'unknown' && input.promptAnchor ? { anchor: input.promptAnchor } : {}) }
        : { status: measurement === 'calibrated' ? 'calibrated' : 'measured', tokens: used },
      reserveTokens: reserve, freeTokens: free ?? null, compactAtTokens: compactAt,
      compaction: { ...(unavailable ? { available: false, reason: unavailable } : {}),
        providerMeasurement: used === undefined ? measurement : measurement === 'calibrated' ? 'calibrated' : 'measured',
        ...(compactionMeasurement ? { source: compactionMeasurement.source,
          ...(compactionReason ? { anchorUnavailable: compactionReason } : {}) }
          : used === undefined ? { source: 'estimated', anchorUnavailable: anchorReason } : {}) },
      inputLimitTokens: input.inputLimit ?? null, outputReserveTokens: input.outputTokens ?? null,
      protocol: input.protocol ?? null,
      toolSchemas: { status: 'estimate', method: 'characters', tokens: schemaTokens, toolCount,
        scope: 'inspection-catalogue', firstRequestLowerBound: false,
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
