import { createAdvisorCodec } from '@cheers/advisor';
import { isRecord } from '../core/values/record.js';
import type { AdvisorConfig, AdvisorState } from './model.js';

const codec = createAdvisorCodec(isRecord);

export function validAdvisorConfig(value: unknown): value is AdvisorConfig {
  return codec.validAdvisorConfig(value);
}

export function decodeAdvisor(value: unknown): AdvisorState | undefined {
  return codec.decodeAdvisor(value);
}
