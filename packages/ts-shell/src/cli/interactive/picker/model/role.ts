import type { Picker } from '../../overlay.js';
import { prepareModelRole, type AutomaticModelRole, type RoleResult } from '../../../../core/commands/model/role.js';
import type { SessionModelRole } from '../../../../session/model/contract.js';
import type { CommandContext } from '../../../../core/commands/types.js';
import { modelRoleThinkingPicker } from './thinking.js';
import type { ThinkingPreference } from '../../../../core/models/effort.js';
import { modelBrowserOwned } from './owner.js';

/** Returning from an editor captures the newly accepted role and a fresh transaction. */
export function modelRoleEditor(context: CommandContext, role: AutomaticModelRole,
  browse: (assign: (target: SessionModelRole) => RoleResult, effort: ThinkingPreference) => Picker,
  back: (notice?: string) => Picker, notice?: string): Picker {
  let edit: ReturnType<typeof prepareModelRole>;
  try { edit = prepareModelRole(context, role); }
  catch { return back(notice ?? 'Role settings could not be read. Reopen the model panel.'); }
  const canReturn = () => modelBrowserOwned(context);
  const picker = modelRolePicker(role, edit.current, edit.assign, () => browse(edit.assign, edit.current?.thinkingEffort ?? null), note => back(note ?? notice),
    edit.current && edit.efforts.length ? () => modelRoleThinkingPicker(edit.current!, edit.efforts, edit.setEffort,
      note => modelRoleEditor(context, role, browse, back, note), edit.admission, canReturn) : undefined, edit.admission, canReturn);
  return Object.assign(picker, notice ? { status: () => notice } : {});
}

/** Role editing returns to the original catalogue and delegates every write. */
export function modelRolePicker(role: AutomaticModelRole, current: SessionModelRole | undefined,
  assign: (target: SessionModelRole | undefined) => RoleResult, browse: () => Picker, back: (notice?: string) => Picker,
  thinking?: () => Picker, admission?: () => string | undefined, canReturn?: () => boolean): Picker {
  let offered = false, retired = false;
  const ownsAction = (stillOwned?: () => boolean): boolean => {
    if (!offered || retired) return false;
    if (stillOwned && !stillOwned()) { offered = false; retired = true; }
    return offered && !retired;
  };
  return {
    title: `${role} model`, form: 'panel', empty: '', filterable: false,
    acceptsOwnership: true,
    back,
    previewEnd: () => { offered = false; retired = true; },
    detail: () => current ? [`${current.provider}/${current.model} · ${current.connectionId}`,
      `Reasoning effort: ${current.thinkingEffort ?? 'provider decides'}`] : ['Follows the default model'],
    footer: 'Enter selects an action · Esc returns',
    async load() {
      if (retired) return [];
      offered = true;
      return [{ id: 'choose', label: 'Choose model' }, { id: 'default', label: 'Use default model' },
        ...(thinking ? [{ id: 'thinking', label: 'Thinking effort' }] : []), { id: 'back', label: 'Back to models' }];
    },
    async apply(ids, stillOwned) {
      if (ids.length !== 1 || !ownsAction(stillOwned)) return undefined;
      const action = ids[0];
      if (!action || !['choose', 'default', 'back'].includes(action) && !(action === 'thinking' && thinking)) return undefined;
      if (action !== 'back') {
        const refusal = admission?.();
        if (!ownsAction(stillOwned)) return undefined;
        if (refusal) {
          let returning = false;
          try { returning = canReturn?.() === true; } catch { /* Keep the refusal when the browser cannot be verified. */ }
          if (!ownsAction(stillOwned)) return undefined;
          offered = false; retired = true;
          return { note: refusal, ...(returning ? { next: back(refusal) } : {}) };
        }
      }
      offered = false; retired = true;
      if (ids[0] === 'choose') return { next: browse() };
      if (ids[0] === 'thinking' && thinking) return { next: thinking() };
      if (ids[0] === 'back') return { next: back() };
      if (ids[0] !== 'default') return undefined;
      const result = assign(undefined);
      return { note: result.output, next: back(result.output) };
    },
  };
}
