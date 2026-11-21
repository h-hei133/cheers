import type { ConfigPublication } from '../../../config/state.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ExtensionHostBridge } from '../../../extensions/runtime/inProcessLoader.js';
import type { SessionModelPublication } from '../../../session/model/state.js';

export interface ReloadPreference {
  readonly host: ExtensionHostBridge;
  readonly signal: AbortSignal;
  readonly check: () => void;
  readonly verify: () => void;
  readonly publishState?: SessionModelPublication['publishState'];
  readonly committed: (readback: () => void) => void;
  readonly accept: (prior: ConfigPublication, next: ConfigPublication) => void;
  running: boolean;
}

export const reloadPreferences = new WeakMap<ShellRuntimeContext, ReloadPreference>();
