import type { ProviderAuthContract, ProviderAccountAuthResult, SignInProgress } from '../auth/providerAuthContract.js';
import { completeGitHubDeviceFlow, startGitHubDeviceFlow } from '../auth/oauth/copilot/flow.js';
import { requestScope } from '../network/request.js';

export async function loginGitHubCopilotViaDeviceFlow(options: { readonly timeoutMs?: number; readonly signal?: AbortSignal;
  readonly onProgress?: (progress: SignInProgress) => void;
} = {}): Promise<ProviderAccountAuthResult> {
  const scope = requestScope(options.timeoutMs ?? 5 * 60_000, options.signal);
  try {
    const grant = await startGitHubDeviceFlow({ signal: scope.signal });
    options.onProgress?.({ authorizeUrl: grant.verificationUri, userCode: grant.userCode });
    const credential = await completeGitHubDeviceFlow({ grant, signal: scope.signal });
    return { ...credential, authorizeUrl: grant.verificationUri, callbackUrl: '' };
  } finally { scope.dispose(); }
}

export const gitHubCopilotProviderAuthContract: ProviderAuthContract = {
  provider: 'github-copilot',
  methods: [{ kind: 'device-code', label: 'Sign in with a GitHub Copilot subscription (code)' }],
  loginAccountAuth: options => loginGitHubCopilotViaDeviceFlow(options),
};
