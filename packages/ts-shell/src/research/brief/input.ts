import path from 'node:path';
import type { AfterToolCallContext } from '../../core/agent/tools.js';
import { isRecord } from '../../core/values/record.js';

/** Only this child's actual complete native text read can bind a required brief. */
export function briefInputHash(context: AfterToolCallContext, workspace: string, requested: string): string | undefined {
  if (context.isError || !['read', 'document_read'].includes(context.call.name) || typeof context.args.path !== 'string'
    || path.resolve(workspace, context.args.path) !== path.resolve(workspace, requested)) return undefined;
  const metadata = context.result.metadata;
  const read = metadata && isRecord(metadata.read) ? metadata.read : undefined;
  const provenance = metadata && isRecord(metadata.provenance) ? metadata.provenance : undefined;
  if (!read || typeof read.text !== 'string' || read.startLine !== 1 || !Number.isSafeInteger(read.totalLines)
    || read.endLine !== read.totalLines || read.stopReason !== undefined || read.oversizedLine !== undefined
    || typeof provenance?.contentHash !== 'string' || !/^[a-f0-9]{64}$/.test(provenance.contentHash)) return undefined;
  return provenance.contentHash;
}
