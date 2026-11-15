import { shellRuntimeFor } from '../../runtime/shell/index.js';
import type { RpcHost } from '../protocol.js';
import type { RuntimeRpcHostOptions } from './contract.js';

/** RPC supplies transport admission; the bound shell runtime owns all effects. */
export function shellHost(options: RuntimeRpcHostOptions): Pick<RpcHost, 'runBash' | 'abortBash'> {
  return {
    runBash: async (command, excludeFromContext) => {
      if (options.isStreaming()) throw new Error('A session operation is still running.');
      const runtime = shellRuntimeFor(options.runtimeContext);
      if (!runtime) throw new Error('Shell execution requires a bound session runtime.');
      return runtime.run(command, excludeFromContext);
    },
    abortBash: () => shellRuntimeFor(options.runtimeContext)?.abort(),
  };
}
