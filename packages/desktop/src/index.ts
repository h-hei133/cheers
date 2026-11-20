import { desktopConfig as configure, verifyDesktopConfig as verifyConfig } from './config.js';
import { DesktopError as NativeError } from './model.js';
import { desktopOperation as operate } from './operation.js';

const desktop = { desktopConfig: configure, verifyDesktopConfig: verifyConfig,
  DesktopError: NativeError, desktopOperation: operate } satisfies typeof import('../api.d.ts');
export const { desktopConfig, verifyDesktopConfig, DesktopError, desktopOperation } = desktop;
