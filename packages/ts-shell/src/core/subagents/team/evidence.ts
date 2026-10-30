import { createHash, randomUUID } from 'node:crypto';
import type { AfterToolCallContext } from '../../agent/tools.js';
import type { Refutation } from './convergence.js';

/** A native read receipt identifies only the selected content, never the whole file. */
export interface ReadReceipt {
  readonly id: string;
  readonly agentId: string;
  readonly stage: 'propose' | 'review';
  readonly locator: string;
  readonly contentHash: string;
  readonly location: 'lines' | 'pages';
  readonly start: number;
  readonly end: number;
}

/** Ephemeral per-agent receipts, issued before the model can cite the result. */
export function readEvidence(agentId: string, stage: ReadReceipt['stage'], signal?: AbortSignal) {
  const prefix = randomUUID();
  const receipts: ReadReceipt[] = [];
  let retired = false;
  return {
    observe: async (context: AfterToolCallContext) => {
      if (retired || signal?.aborted || context.call.name !== 'read' || context.isError || context.result.isError) return undefined;
      const source = nativeSource(context);
      if (!source) return undefined;
      const receipt: ReadReceipt = { ...source, agentId, stage, id: `${prefix}:${receipts.length + 1}` };
      receipts.push(receipt);
      return { suffix: `Read receipt: ${receipt.id} (${JSON.stringify(receipt.locator)}, ${receipt.location} ${receipt.start}-${receipt.end}). `
        + 'This receipt covers only the returned content. Cite its ID after evidence: when checking a claim.' };
    },
    bind: (findings: readonly Refutation[]): readonly Refutation[] => findings.map(finding => {
      const valid = stage === 'review' && finding.reviewerId === agentId && finding.evidence.length > 0
        && finding.evidence.every(id => receipts.some(receipt => receipt.id === id));
      return valid ? { ...finding, evidence: [...new Set(finding.evidence)] } : {
        ...finding, kind: 'insufficient', evidence: [],
        reason: `This finding lacks evidence bound to successful reads by the current reviewer. ${finding.reason}`.trim(),
      };
    }),
    snapshot: (): readonly ReadReceipt[] => receipts.map(receipt => ({ ...receipt })),
    retire: () => { retired = true; },
  };
}

function nativeSource(context: AfterToolCallContext): Omit<ReadReceipt, 'id' | 'agentId' | 'stage'> | undefined {
  const metadata = context.result.metadata;
  const provenance = record(metadata?.provenance);
  const locator = provenance?.locator;
  if (typeof locator !== 'string' || !locator || locator !== context.args.path) return undefined;
  const read = record(metadata?.read);
  if (provenance?.parser === 'utf8' && provenance.location === 'lines' && provenance.hashScope === 'selected-text'
    && typeof read?.text === 'string' && read.text.trim() && range(read.startLine, read.endLine)) {
    const contentHash = createHash('sha256').update(read.text).digest('hex');
    if (contentHash !== provenance.contentHash) return undefined;
    return { locator, contentHash, location: 'lines', start: read.startLine as number, end: read.endLine as number };
  }
  const media = record(metadata?.media);
  if (provenance?.parser !== 'poppler' || provenance.location !== 'pages' || media?.kind !== 'pdf'
    || typeof media.sourceHash !== 'string' || !/^[a-f0-9]{64}$/.test(media.sourceHash)
    || !range(media.startPage, media.endPage) || !Array.isArray(media.pages)) return undefined;
  const pages = media.pages.map(record);
  if (!pages.some(page => page?.status === 'text' && typeof page.text === 'string' && page.text.trim())) return undefined;
  return { locator, contentHash: media.sourceHash, location: 'pages', start: media.startPage as number, end: media.endPage as number };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function range(start: unknown, end: unknown): boolean {
  return typeof start === 'number' && typeof end === 'number' && Number.isSafeInteger(start) && start >= 1
    && Number.isSafeInteger(end) && end >= start;
}
