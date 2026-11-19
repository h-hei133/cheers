import type {ImageContent} from '../../../model-adapters/multimodal.js';
import type {InputAdmissionReceipt} from '../../hooks/input/receipt.js';

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

export class InputPreparationError extends Error {
  constructor() {super('Prompt input was refused before submission.'); this.name = 'InputPreparationError';}
}
