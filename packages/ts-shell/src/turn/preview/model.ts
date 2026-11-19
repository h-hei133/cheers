import { randomUUID } from 'node:crypto';
import { redactReportText } from '../../core/security/redaction.js';
import { truncateTextBytes } from '../../core/tools/truncation.js';
import { isRecord } from '../../core/values/record.js';
import type { ToolSchema } from '../tools.js';
import type { ToolPreview } from './contract.js';
import { ArgumentFields } from './fields.js';

export interface WireToolArguments {
  readonly index: number;
  readonly name: string;
  readonly delta?: string;
  readonly fields?: Readonly<Record<string, unknown>>;
}
export type ObserveToolArguments = (input: WireToolArguments) => void;

const MAX_CALLS = 8;
const MAX_FIELDS = 6;
const MAX_UPDATES = 12;
const MAX_OBJECT_FIELDS = 64;
const MAX_TARGET_BYTES = 96;
const FIELD_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
const TOOL_NAME = /^[A-Za-z_][A-Za-z0-9_./:-]{0,63}$/;
const PATH_FIELDS = new Set(['path', 'file_path', 'filePath']);

interface Call {
  readonly name: string;
  readonly properties: Readonly<Record<string, unknown>>;
  readonly parser: ArgumentFields;
  readonly fields: Set<string>;
  updates: number;
  snapshot: string;
  target?: string;
  truncated?: true;
  invalid?: boolean;
}

/** Read a complete, display-safe path. Other argument values stay in the execution owner. */
function previewPath(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 1024
    || /(?:^[A-Za-z]:|^[/\\]|:\/\/|[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}])/u.test(value)) return undefined;
  const safe = redactReportText(value, 1024);
  return Buffer.byteLength(safe) > MAX_TARGET_BYTES ? truncateTextBytes(safe, MAX_TARGET_BYTES - 3) + '...' : safe || undefined;
}

function addField(call: Call, key: string, value: unknown): void {
  if (!FIELD_NAME.test(key) || !Object.hasOwn(call.properties, key)) return;
  if (!call.fields.has(key) && call.fields.size === MAX_FIELDS) { call.truncated = true; return; }
  call.fields.add(key);
  if (PATH_FIELDS.has(key)) call.target = previewPath(value);
}

export function toolPreview(
  tools: readonly ToolSchema[],
  publish: (preview: ToolPreview) => void,
  signal?: AbortSignal,
  isCurrent?: () => boolean,
) {
  const schemas = new Map(tools.map(tool => [tool.function.name, tool.function.parameters]));
  const calls = new Map<number, Call>();
  const previewId = randomUUID();
  let closed = false;
  const emit = (value: ToolPreview): void => {
    try { publish(Object.freeze(value)); } catch { /* Preview has no effect on request settlement. */ }
  };
  const close = (): void => {
    if (closed) return;
    closed = true;
    signal?.removeEventListener('abort', close);
    if (calls.size > 0) emit({ phase: 'end', previewId });
    calls.clear();
  };
  signal?.addEventListener('abort', close, { once: true });
  return {
    observe(input: WireToolArguments): void {
      if (closed || signal?.aborted || !Number.isSafeInteger(input.index) || input.index < 0) return;
      try { if (isCurrent?.() === false) { close(); return; } } catch { close(); return; }
      let call = calls.get(input.index);
      if (!call) {
        const properties = schemas.get(input.name)?.properties;
        if (!schemas.has(input.name) || !TOOL_NAME.test(input.name) || calls.size >= MAX_CALLS) return;
        call = { name: input.name, properties: isRecord(properties) ? properties : {}, parser: new ArgumentFields(),
          fields: new Set(), updates: 0, snapshot: '' };
        calls.set(input.index, call);
        emit({ phase: 'start', previewId, index: input.index, toolName: call.name, fields: Object.freeze([]) });
      }
      if (closed || call.invalid || call.updates >= MAX_UPDATES) return;
      if (call.name !== input.name) call.invalid = true;
      if (!call.invalid && input.fields) {
        // Compatible hosts can send already decoded object arguments.
        call.fields.clear();
        call.target = undefined;
        call.truncated = undefined;
        let visited = 0;
        for (const key in call.properties) {
          if (++visited > MAX_OBJECT_FIELDS) { call.truncated = true; break; }
          const field = Object.getOwnPropertyDescriptor(input.fields, key);
          if (field && 'value' in field) addField(call, key, field.value);
          if (call.truncated) break;
        }
      } else if (!call.invalid && input.delta) {
        const verdict = call.parser.append(input.delta, (key, value) => addField(call, key, value));
        if (verdict === 'invalid') call.invalid = true;
        if (verdict === 'bounded') call.truncated = true;
      }
      if (call.invalid) {
        call.fields.clear();
        call.target = undefined;
      }
      const fields = Object.freeze([...call.fields]);
      const snapshot = JSON.stringify([fields, call.target, call.truncated]);
      if (snapshot === call.snapshot || (call.updates === 0 && !fields.length && !call.truncated)) return;
      call.snapshot = snapshot;
      call.updates++;
      emit({ phase: 'update', previewId, index: input.index, toolName: call.name, fields,
        ...(call.target ? { target: call.target } : {}), ...(call.truncated ? { truncated: true } : {}) });
    },
    close,
  };
}
