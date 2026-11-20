import type { PwRuntimeStatus, PwRuntimeStatusInput, RuntimeImportResult } from '@cheers/browser';
import { sanitizeBrowserText } from './capabilityModel.js';

export type {
  PwBrowser, PwBrowserContext, PwBrowserType, PwLocator, PwPage, PwRoute,
  PwRuntimeModule, PwRuntimeStatus, PwRuntimeStatusInput, PwRuntimeStatusKind,
} from '@cheers/browser';

async function loadBrowserRuntime(): Promise<typeof import('@cheers/browser') | undefined> {
  try {
    return await import('@cheers/browser');
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    if (code === 'ERR_MODULE_NOT_FOUND' || code === 'MODULE_NOT_FOUND') return undefined;
    throw error;
  }
}

export async function getPwRuntimeStatus(input: PwRuntimeStatusInput = {}): Promise<PwRuntimeStatus> {
  const runtime = input.enabled === false ? undefined : await loadBrowserRuntime();
  if (runtime) return runtime.getPwRuntimeStatus(input, sanitizeBrowserText);

  const disabled = input.enabled === false;
  const status = disabled ? 'disabled' : 'package-missing';
  const reasonCode = disabled ? 'runtime-disabled' : 'runtime-package-missing';
  const evidence = disabled ? ['pw-runtime:disabled'] : ['pw-runtime:import-missing', 'pw-runtime:passive-no-launch'];
  return {
    status, reasonCode, dependency: 'none', browserName: 'chromium',
    executableSource: 'none', realBrowserValidationAvailable: false,
    passiveStatusCheck: true, browserLaunched: false, providerCall: 'none', modelCall: 'none', mcpLaunched: false,
    reason: disabled ? 'Direct Playwright runtime status checks are disabled.' : 'The optional browser package is unavailable.',
    skipReason: disabled ? 'direct-playwright-disabled' : 'playwright-package-missing',
    nextAction: disabled
      ? 'Enable the explicit runtime status check before attempting controlled browser validation.'
      : 'Install the workspace browser package before running real browser validation.',
    warnings: [`pw-runtime:${status}`],
    evidence: [...evidence, `pw-runtime:status:${status}`, `pw-runtime:reason:${reasonCode}`, 'pw-runtime:executable-source:none',
      'pw-runtime:no-provider-or-model-call', 'pw-runtime:no-mcp-launch', 'pw-runtime:no-browser-launch-during-status'],
  };
}

export async function importPwRuntime(importer?: (specifier: string) => Promise<unknown>): Promise<RuntimeImportResult> {
  const runtime = await loadBrowserRuntime();
  return runtime ? runtime.importPwRuntime(importer)
    : { ok: false, evidence: ['pw-runtime:import-missing', 'pw-runtime:passive-no-launch'] };
}
