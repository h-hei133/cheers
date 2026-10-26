import { textSize } from './measure.js';
import type { ContextFields, PromptSource, RequestContext, TextSize } from './model.js';
import { estimateWirePromptDetails } from './wire.js';

/** Only sizes and explicit model identity survive; no request text or credentials are retained. */
export function requestContext(input: {
  readonly body: string;
  readonly provider: string;
  readonly model: string;
  readonly endpoint: string;
  readonly fields?: ContextFields;
  readonly systemSources?: readonly PromptSource[];
}): RequestContext {
  const body = textSize(input.body);
  const parsed = parseBody(input.body);
  const partsValue = parsed && input.fields ? parts(parsed, body, input.fields) : undefined;
  let localEstimate: RequestContext['localEstimate'];
  if (parsed && input.fields && partsValue) {
    try {
      const estimate = estimateWirePromptDetails(parsed, input.fields);
      localEstimate = Object.freeze({ tokens: estimate.tokens, method: 'characters/3.5' as const,
        scope: 'assembled-request' as const,
        ...(estimate.imageCount ? { image: Object.freeze({ count: estimate.imageCount, allowanceTokens: estimate.imageAllowanceTokens }) } : {}) });
    } catch (error) {
      // Opaque reasoning or an incompatible field declaration has no local count.
      if (!(error instanceof Error) || (error.message !== 'Endpoint prompt fields are unavailable.'
        && error.message !== 'Opaque reasoning has no local token measurement.')) throw error;
    }
  }
  return Object.freeze({ provider: input.provider, model: input.model, endpoint: input.endpoint,
    capturedAt: new Date().toISOString(), body,
    ...(partsValue ? { parts: partsValue } : {}),
    ...(localEstimate ? { localEstimate } : {}),
    ...(input.systemSources ? { systemSources: Object.freeze(input.systemSources.map(source => Object.freeze({
      kind: source.kind, bytes: source.bytes, codeUnits: source.codeUnits,
    }))) } : {}),
  });
}

function parseBody(text: string): Record<string, unknown> | undefined {
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    return body && typeof body === 'object' && !Array.isArray(body) ? body : undefined;
  } catch { return undefined; }
}

function parts(body: Record<string, unknown>, total: TextSize, fields: ContextFields): RequestContext['parts'] {
  const names = [fields.conversation, fields.system, fields.tools].filter(name => name !== undefined);
  if (new Set(names).size !== names.length || (fields.firstMessageIsSystem && fields.system)) return undefined;
  const messages = body[fields.conversation];
  if (!Array.isArray(messages)) return undefined;
  if (fields.firstMessageIsSystem && (!messages[0] || !['system', 'developer'].includes(messages[0].role))) return undefined;
  const system = fields.firstMessageIsSystem ? sumValues(messages.slice(0, 1)) : valueSize(fields.system ? body[fields.system] : undefined);
  const conversation = fields.firstMessageIsSystem ? sumValues(messages.slice(1)) : valueSize(messages);
  const tools = valueSize(fields.tools ? body[fields.tools] : undefined);
  const envelope = { bytes: total.bytes - system.bytes - conversation.bytes - tools.bytes,
    codeUnits: total.codeUnits - system.codeUnits - conversation.codeUnits - tools.codeUnits };
  if (envelope.bytes < 0 || envelope.codeUnits < 0) return undefined;
  return Object.freeze({ system, conversation, tools, envelope: Object.freeze(envelope) });
}

function valueSize(value: unknown): TextSize {
  return textSize(value === undefined ? '' : JSON.stringify(value));
}

function sumValues(values: readonly unknown[]): TextSize {
  let bytes = 0; let codeUnits = 0;
  for (const value of values) { const size = valueSize(value); bytes += size.bytes; codeUnits += size.codeUnits; }
  return Object.freeze({ bytes, codeUnits });
}
