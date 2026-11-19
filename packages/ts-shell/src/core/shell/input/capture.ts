import {snapshotData} from '../../values/data.js';
import {isRecord} from '../../values/record.js';
import type {PromptInputRequest} from './contract.js';
import {InputPreparationError} from './contract.js';

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
