export interface SshSelection {
  readonly version: 1;
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly workspace: string;
  readonly executable: string;
  readonly hostKey: string;
}

export interface SshProfile {
  readonly selection: SshSelection;
  readonly identity: string;
  readonly fingerprint: string;
  check(): void;
  /** Credential bytes remain private to the native transport working directory. */
  keySnapshot(): string;
}

export interface SshWorkspace {
  readonly profileIdentity: string;
  readonly fingerprint: string;
  readonly root: string;
  readonly directoryIdentity: string;
  readonly uid: number;
  readonly bootId: string;
  readonly namespace: string;
}
export interface SshJobSpec {
  readonly id: string;
  readonly command: string;
  readonly digest: string;
  readonly binding: SshWorkspace;
}

export type SshFailure = 'invalid' | 'denied' | 'changed' | 'unavailable' | 'transport' | 'protocol' | 'output-limit' | 'cleanup';
export class SshError extends Error {
  constructor(readonly code: SshFailure) {
    super(`SSH ${code}; no remote outcome was established.`); this.name = 'SshError';
  }
}
export function requireSsh(value: unknown, code: SshFailure = 'invalid'): asserts value {
  if (!value) throw new SshError(code);
}
