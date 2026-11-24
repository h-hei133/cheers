import { providerBindingAvailable } from '../../../core/auth/binding.js';
import { availabilitySnapshot } from '../../../core/models/availability.js';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { CliModePlan } from '../../../entrypoints/cliModeDispatch.js';
import type { CliOptions } from '../../options/cliOptions.js';
import type { CliProviderRuntimeBridge } from '../../provider/cliProviderRuntimeBridge.js';

/** A fresh terminal launch can offer setup using configuration and environment alone. */
export function startupConnection(input: {
  readonly options: CliOptions;
  readonly mode: CliModePlan['kind'];
  readonly terminal: boolean;
  readonly context: ShellRuntimeContext;
  readonly provider: Pick<CliProviderRuntimeBridge, 'resolveCredentialSnapshot' | 'providerModeEnv'>;
}): (() => boolean) | undefined {
  const { options, context, provider } = input;
  if (!input.terminal || input.mode !== 'interactive' || options.resumeSession || options.continueSession
    || options.sessionId || options.forkSource || options.promptArg || options.printMode || options.jsonEvents || options.rpcMode
    || options.replayFile || options.offline || provider.providerModeEnv() === 'synthetic') return;
  const session = context.session;
  return () => {
    const { config, catalog, admissionBlocked } = context.configuration.current;
    if (context.session !== session || admissionBlocked || config.offline || config.providerConnections.length > 0) return false;
    try {
      const active = provider.resolveCredentialSnapshot();
      if (active.blocked || active.credential || providerBindingAvailable(catalog, active)) return false;
      return !availabilitySnapshot({ config, catalog }).providers.some(row => row.credential === 'present');
    } catch {
      return false;
    }
  };
}
