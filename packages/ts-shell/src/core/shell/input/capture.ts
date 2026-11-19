import {snapshotData} from '../../values/data.js';
import {isRecord} from '../../values/record.js';
import type {CaptureQueuedPromptInput, PromptInputRequest} from './contract.js';
import {InputPreparationError} from './contract.js';
import type {TurnInput} from '../../../turn/session.js';

/** Detach caller data before input callbacks, provenance admission or persistence can await. */
export function capturePromptInput(input: Pick<PromptInputRequest, 'prompt' | 'images' | 'metadata'>): Pick<PromptInputRequest, 'prompt' | 'images' | 'metadata'> {
  try {
    const captured = snapshotData(input, {bytes:64*1024*1024, nodes:250_000, depth:48});
    if (!isRecord(captured) || typeof captured.prompt !== 'string'
      || captured.metadata !== undefined && !isRecord(captured.metadata)
      || captured.images !== undefined && !Array.isArray(captured.images)) throw new InputPreparationError();
    return captured as unknown as Pick<PromptInputRequest, 'prompt' | 'images' | 'metadata'>;
  } catch {throw new InputPreparationError();}
}

/** Retain the run that accepted the draft even if another run starts before delivery. */
export function bindQueuedPromptInput(input: TurnInput, sessionId: string, checkRun: () => void,
  capture: CaptureQueuedPromptInput): TurnInput {
  return { ...input, submit: (lane, prompt, source, images) => {
    if (input.isAccepting?.() === false) return false;
    checkRun();
    const captured = capturePromptInput({prompt, images});
    const prepare = capture({sessionId, source, streamingBehavior:lane, checkRun});
    checkRun();
    if (input.isAccepting?.() === false) return false;
    input[lane](captured.prompt, undefined, {images:captured.images, prepare});
    return true;
  } };
}
