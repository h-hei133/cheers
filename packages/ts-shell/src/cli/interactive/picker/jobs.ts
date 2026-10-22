import { hubPicker } from './hub.js';
import type { JobsComposition } from '../../jobs/model.js';
import type { Picker } from '../overlay.js';

/** Jobs use the same read-only projection as the hub; the entry point differs. */
export function jobsPicker(jobs: JobsComposition | undefined): Picker {
  if (!jobs) {
    return {
      title: 'Jobs',
      form: 'panel',
      empty: '',
      loadError: 'Jobs require a bound session runtime.',
      async load() { throw new Error('Jobs require a bound session runtime.'); },
      async apply() { return undefined; },
    };
  }
  return { ...hubPicker(jobs), title: 'Jobs' };
}
