import type { AgentMessage } from '../../core/agent/state.js';
import type { CompactionOperationInput, SummarizeHistory, SummarizeRequest, SummarizeTurnPrefix } from './contract.js';
import { SummaryAdmissionError } from './contract.js';
import { claimCompactionStep, completeCompactionStep, compactionStepDigest, dispatchCompactionStep,
  markCompactionStepUnknown, releaseCompactionStep } from './state.js';
import { MAX_SEGMENTS, scheduleSegments } from './schedule.js';
import { formatFileFootprintXml, mergeCheckpointFootprints } from '../../core/query/compaction/fileFootprint.js';
import { formatCheckpointMessage, parseCompactedSummary } from '../../core/query/compaction/summarizer.js';

export class CompactionStepUnknown extends Error {}

async function runStep(input: {
  readonly operation?: CompactionOperationInput;
  readonly stage: string;
  readonly request: SummarizeRequest;
  readonly summarize: SummarizeHistory;
}): Promise<string | undefined> {
  input.request.signal?.throwIfAborted();
  input.summarize.preflight?.(input.request);
  const claim = input.operation ? claimCompactionStep({ ...input.operation,
    stepDigest: compactionStepDigest({ history: input.request.messages, previousSummary: input.request.previousSummary,
      instructions: input.request.instructions, stage: input.stage }) }) : undefined;
  if (claim?.unknown) throw new CompactionStepUnknown();
  if (claim?.summary !== undefined) return claim.summary;
  let dispatched = false;
  const dispatch = (): void => {
    input.request.signal?.throwIfAborted();
    // A failed persistence/readback is uncertain and must never be released.
    dispatched = true;
    if (claim) dispatchCompactionStep(claim);
  };
  try {
    // Injected summarizers without a transport still have an explicit conservative boundary.
    if (!input.summarize.dispatchAware) dispatch();
    const summary = await input.summarize({ ...input.request, dispatch: { dispatch } });
    if (summary?.trim()) {
      if (!dispatched) throw new Error('Summary transport did not verify its dispatch.');
      if (claim && input.operation) completeCompactionStep(claim, input.operation.sessionId, summary);
      input.request.signal?.throwIfAborted();
      return summary;
    }
    if (claim && input.operation) {
      if (dispatched) markCompactionStepUnknown(claim, input.operation.sessionId);
      else releaseCompactionStep(claim);
    }
    return undefined;
  } catch (error) {
    if (claim && input.operation) {
      if (dispatched) markCompactionStepUnknown(claim, input.operation.sessionId);
      else releaseCompactionStep(claim);
    }
    throw error;
  }
}

/** Each segment and each merge is a distinct metered, preflighted durable step. */
export async function generateCompaction(input: {
  readonly history: readonly AgentMessage[];
  readonly prefix: readonly AgentMessage[];
  readonly previousSummary?: string;
  readonly instructions?: string;
  readonly signal?: AbortSignal;
  readonly maxTokens?: number;
  readonly operation?: CompactionOperationInput;
  readonly summarize: SummarizeHistory;
  readonly summarizeTurnPrefix?: SummarizeTurnPrefix;
}): Promise<string | undefined> {
  const request = (messages: readonly AgentMessage[], previousSummary?: string): SummarizeRequest => ({ messages,
    previousSummary, instructions: input.instructions, signal: input.signal });
  const prefixSummarizer: SummarizeHistory | undefined = input.summarizeTurnPrefix && Object.assign(
    (value: SummarizeRequest) => input.summarizeTurnPrefix!(value.messages, value.signal, value.dispatch),
    { dispatchAware: input.summarizeTurnPrefix.dispatchAware,
      preflight: (value: SummarizeRequest) => input.summarizeTurnPrefix?.preflight?.(value.messages, value.signal) });
  const history = input.summarizeTurnPrefix ? input.history : [...input.history, ...input.prefix];
  const historySegments = scheduleSegments({ messages: history, maxTokens: input.maxTokens,
    validate: messages => input.summarize.preflight?.(request(messages, input.previousSummary)) });
  const prefixSegments = prefixSummarizer ? scheduleSegments({ messages: input.prefix, maxTokens: input.maxTokens,
    validate: messages => prefixSummarizer.preflight?.(request(messages)) }) : [];
  if (historySegments.length + prefixSegments.length > MAX_SEGMENTS) throw new SummaryAdmissionError('Summary request refused: the bounded segment schedule is full.');
  let sends = 0;
  const run = async (stage: string, value: SummarizeRequest, summarize: SummarizeHistory): Promise<string | undefined> => {
    if (++sends > MAX_SEGMENTS * 2) throw new SummaryAdmissionError('Summary request refused: the bounded merge schedule is full.');
    return runStep({ operation: input.operation, stage, request: value, summarize });
  };
  const summarizeSegments = async (stage: string, segments: readonly (readonly AgentMessage[])[], summarize: SummarizeHistory,
    previousSummary?: string): Promise<string | undefined> => {
    let summaries: string[] = [];
    for (let index = 0; index < segments.length; index++) {
      const summary = await run(`${stage}:${index}`, request(segments[index]!, index === 0 ? previousSummary : undefined), summarize);
      if (!summary) return undefined;
      summaries.push(summary);
    }
    if (!summaries.length) return previousSummary;
    let round = 0;
    while (summaries.length > 1) {
      const merged: string[] = [];
      for (let index = 0; index < summaries.length; index += 2) {
        if (index + 1 === summaries.length) { merged.push(summaries[index]!); continue; }
        const value = request(summaries.slice(index, index + 2).map(content => ({ role: 'user', content })));
        // Merge pairs remain indivisible; oversized summaries refuse instead of lossy slicing.
        if (scheduleSegments({ messages: value.messages, maxTokens: input.maxTokens,
          validate: messages => input.summarize.preflight?.({ ...value, messages }) }).length !== 1) {
          throw new SummaryAdmissionError('Summary request refused: merged material exceeds its request budget.');
        }
        const summary = await run(`${stage}:merge:${round}:${index}`, value, input.summarize);
        if (!summary) return undefined;
        const footprint = formatFileFootprintXml(mergeCheckpointFootprints(summaries.slice(index, index + 2)));
        merged.push(footprint ? formatCheckpointMessage(parseCompactedSummary(summary).rawSummary, footprint) : summary);
      }
      summaries = merged;
      round++;
    }
    return summaries[0];
  };
  const historyText = await summarizeSegments('history', historySegments, input.summarize, input.previousSummary);
  if (historySegments.length && !historyText) return undefined;
  const prefixText = prefixSummarizer ? await summarizeSegments('prefix', prefixSegments, prefixSummarizer) : undefined;
  if (prefixSegments.length && !prefixText) return undefined;
  return prefixText && historyText ? `${historyText}\n\n---\n\n**Turn Context (split turn):**\n\n${prefixText}` : prefixText ?? historyText;
}
