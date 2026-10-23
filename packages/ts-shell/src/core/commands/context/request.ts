import { CHARS_PER_TOKEN } from '../../../session/context.js';
import type { RequestContext } from '../../../context/request/model.js';
import type { ReportLine, ReportValue } from '../report/contract.js';
import { span } from '../report/projection.js';
import { reportMetadata } from '../report/metadata.js';

const REQUEST_ROWS = 64;

/** Request observations never apportion an aggregate provider count among estimated sources. */
export function requestDetails(request: RequestContext | undefined, projectRoot = process.cwd()): { lines: ReportLine[]; facts: Record<string, ReportValue> } {
  const lines: ReportLine[] = [{ kind: 'space' }, { kind: 'heading', spans: [span('Last accepted foreground request', 'heading')] }];
  if (!request) {
    lines.push({ kind: 'text', spans: [span('No foreground request was captured in this runtime for the current context.')] });
    return { lines, facts: { status: 'unavailable', scope: 'foreground' } };
  }
  const safe = (value: string) => reportMetadata(value, projectRoot);
  const provider = safe(request.provider), model = safe(request.model), endpoint = safe(request.endpoint), capturedAt = safe(request.capturedAt);
  lines.push({ kind: 'text', spans: [span(`${provider || 'unknown provider'}/${model} · ${endpoint} · ${capturedAt}`)] },
    { kind: 'columns', cells: [[span('Serialized body')], [span(`${request.body.bytes.toLocaleString()} bytes`, 'number')],
      [span(`measured UTF-8; ${request.body.codeUnits.toLocaleString()} UTF-16 code units`)]] });
  const parts = request.parts ? Object.entries(request.parts) : undefined;
  const shownParts = parts?.slice(0, REQUEST_ROWS);
  const omittedParts = (parts?.length ?? 0) - (shownParts?.length ?? 0);
  if (shownParts) {
    for (const [name, size] of shownParts) {
      lines.push({ kind: 'columns', cells: [[span(`Wire ${name}`)], [span(`${size.bytes.toLocaleString()} bytes`, 'number')],
        [span(`${size.codeUnits.toLocaleString()} UTF-16 code units; serialized fragment`)]] });
    }
    if (omittedParts > 0) lines.push({ kind: 'text', spans: [span(`${omittedParts} wire categories omitted from this bounded report.`, 'muted')] });
  } else lines.push({ kind: 'text', spans: [span('Wire category breakdown is unavailable for this protocol.')] });
  lines.push({ kind: 'text', spans: [span('Wire categories plus envelope equal the captured body. Envelope includes JSON framing and request settings; media bytes are not token counts.')] });
  const systemSources = request.systemSources?.slice(0, REQUEST_ROWS);
  const omittedSources = (request.systemSources?.length ?? 0) - (systemSources?.length ?? 0);
  if (systemSources) {
    lines.push({ kind: 'space' }, { kind: 'heading', spans: [span('System text sources before serialization', 'heading')] });
    for (const source of systemSources) lines.push({ kind: 'columns', cells: [[span(source.kind)],
      [span(`${source.bytes.toLocaleString()} bytes`, 'number')],
      [span(`${source.codeUnits.toLocaleString()} UTF-16 code units; ~${Math.round(source.codeUnits / CHARS_PER_TOKEN).toLocaleString()} tokens estimated`)]] });
    if (omittedSources > 0) lines.push({ kind: 'text', spans: [span(`${omittedSources} system sources omitted from this bounded report.`, 'muted')] });
    lines.push({ kind: 'text', spans: [span(`Source estimates use UTF-16 code units / ${CHARS_PER_TOKEN}; raw source sizes are not additive to wire sizes.`)] });
  }
  lines.push({ kind: 'space' }, { kind: 'text', spans: [span(request.promptTokens === undefined
    ? 'Provider prompt usage for this request is unknown.' : `Provider reported ${request.promptTokens.toLocaleString()} input tokens for this request.`)] },
  { kind: 'text', spans: [span('Tokenizer count unavailable. Provider usage is aggregate; no per-source token allocation is inferred.')] });
  return { lines, facts: { status: 'accepted', scope: 'foreground', provider, model, endpoint,
    capturedAt, body: { ...request.body }, byteEncoding: 'utf8', characterUnit: 'utf16-code-units',
    parts: shownParts ? Object.fromEntries(shownParts.map(([name, size]) => [name, { ...size }])) : null,
    partsShown: shownParts?.length ?? 0, partsOmitted: omittedParts,
    systemSources: systemSources?.map(source => ({ ...source, estimatedTokens: Math.round(source.codeUnits / CHARS_PER_TOKEN) })) ?? null,
    systemSourcesShown: systemSources?.length ?? 0, systemSourcesOmitted: omittedSources,
    coverage: omittedParts > 0 || omittedSources > 0 ? 'partial' : 'complete',
    sourceEstimate: { method: 'utf16-code-units', divisor: CHARS_PER_TOKEN }, tokenizer: { status: 'unavailable' },
    usage: request.promptTokens === undefined ? { status: 'unknown' } : { status: 'reported', promptTokens: request.promptTokens },
  } };
}
