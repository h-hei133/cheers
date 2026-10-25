import type { Picker } from '../../overlay.js';
import type { AutomaticModelRole, RoleResult } from '../../../../core/commands/model/role.js';
import type { SessionModelRole } from '../../../../session/model/contract.js';

/** Role editing returns to the original catalogue and delegates every write. */
export function modelRolePicker(role: AutomaticModelRole, current: SessionModelRole | undefined,
  assign: (target: SessionModelRole | undefined) => RoleResult, browse: () => Picker, back: (notice?: string) => Picker): Picker {
  let offered = false;
  return {
    title: `${role} model`, form: 'panel', empty: '', filterable: false,
    back,
    detail: () => [current ? `${current.provider}/${current.model} · ${current.connectionId}` : 'Follows the default model'],
    footer: 'Enter selects an action · Esc returns',
    async load() {
      offered = true;
      return [{ id: 'choose', label: 'Choose model' }, { id: 'default', label: 'Use default model' }, { id: 'back', label: 'Back to models' }];
    },
    async apply(ids) {
      if (!offered || ids.length !== 1) return undefined;
      if (ids[0] === 'choose') return { next: browse() };
      if (ids[0] === 'back') return { next: back() };
      if (ids[0] !== 'default') return undefined;
      const result = assign(undefined);
      return { note: result.output, ...(result.saved ? { next: back(result.output) } : {}) };
    },
  };
}
