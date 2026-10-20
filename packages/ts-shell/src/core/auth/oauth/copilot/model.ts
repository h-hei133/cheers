export interface CopilotCredential {
  readonly provider: 'github-copilot';
  readonly accessToken: string;
  /** The GitHub token, retained across short-lived Copilot session exchanges. */
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly baseUrl: string;
  readonly production?: object;
}

export class SubscriptionError extends Error {
  constructor(message: string, readonly provider = 'github-copilot') {
    super(message);
    this.name = 'SubscriptionError';
  }
}
