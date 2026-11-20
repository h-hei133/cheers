import * as driver from './runtime.js';

const runtime = driver satisfies typeof import('../api.d.ts');
export const { getPwRuntimeStatus, importPwRuntime } = runtime;
