export interface ProfileSwitchPort {
  request(input: { readonly target: string; readonly confirmation?: string; readonly sessionId?: string; readonly signal?: AbortSignal }): Promise<
    | { readonly status: 'preview'; readonly digest: string; readonly target: string }
    | { readonly status: 'requested'; readonly operation: string }
    | { readonly status: 'unavailable'; readonly reason: string }>;
  inspect(operation: string): string;
}
