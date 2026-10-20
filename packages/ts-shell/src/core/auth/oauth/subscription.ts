// Compatibility exports; native behavior belongs to its provider.
export { completeGitHubDeviceFlow, startGitHubDeviceFlow, refreshCopilotToken, nativeCopilotLogin } from './copilot/flow.js';
export { copilotBaseUrl } from './copilot/policy.js';
export { SubscriptionError, type CopilotCredential as SubscriptionCredential } from './copilot/model.js';
