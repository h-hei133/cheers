import type {ImageContent} from '../../../model-adapters/multimodal.js';
import type {InputAdmissionReceipt} from '../../hooks/input/receipt.js';
import type {InputDisposition, QueuedInputOptions} from '../../../turn/input.js';

export interface PromptInputRequest {
  readonly sessionId: string;
  readonly prompt: string;
  readonly images?: readonly ImageContent[];
  readonly source: 'interactive' | 'rpc' | 'extension' | 'sdk' | 'cli';
  readonly metadata?: Record<string, unknown>;
  readonly signal: AbortSignal;
}
export type PreparedPromptInput = {readonly status:'handled'; readonly check: () => void}
  | {readonly status:'continue'; readonly prompt: string; readonly images?: readonly ImageContent[]; readonly check: () => void;
    readonly published: () => void;
    readonly admission: InputAdmissionReceipt};

export interface QueuedPromptInputRequest extends PromptInputRequest {
  readonly streamingBehavior: InputDisposition;
  readonly checkRun: () => void;
}

export type QueuedPromptBinding = Pick<QueuedPromptInputRequest, 'sessionId' | 'source' | 'streamingBehavior' | 'checkRun'>;
export type CaptureQueuedPromptInput = (binding: QueuedPromptBinding) => NonNullable<QueuedInputOptions['prepare']>;

export class InputPreparationError extends Error {
  constructor() {super('Prompt input was refused before submission.'); this.name = 'InputPreparationError';}
}
