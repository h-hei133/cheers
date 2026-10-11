import { describe, expect, it } from 'vitest';
import { effortCapability } from '../../models/capability.js';
import { saveModelPreset, validateModelPreset } from './preset.js';

describe('model preset validation', () => {
  it('rejects an empty role set before persistence', () => {
    expect(validateModelPreset({})).toContain('at least one role');
  });

  it('treats a missing model entry as unverified rather than unsupported', () => {
    expect(effortCapability([], 'custom', 'model', 'high')).toBe('unverified');
  });

  it('does not claim persistence for an absent session', () => {
    expect(saveModelPreset('missing', 'default', { default: { connectionId: 'c', provider: 'p', model: 'm' } })).toContain('selected model');
  });
});
