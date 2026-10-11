/** Stable identity shared by session publication and retained feature payloads. */
export interface BoundSessionHost { readonly getSessionDirPath: (sessionId: string) => string }
export interface BoundSessionScope {
  readonly sessionId: string;
  readonly sessionCreatedAt: string;
  readonly workspace: { readonly path: string; readonly identity: string };
}
