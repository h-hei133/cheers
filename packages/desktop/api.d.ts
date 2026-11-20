export interface Rectangle {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface DesktopSnapshot {
  readonly id: string;
  readonly scope: 'screen' | 'window';
  readonly windowId?: string;
  readonly focus: string;
  readonly frame: Rectangle;
  readonly screen: { readonly width: number; readonly height: number };
  readonly windowIdentity?: string;
  readonly image?: { readonly width: number; readonly height: number; readonly masks: readonly Rectangle[]; readonly coordinatesAvailable: boolean };
}

export interface DesktopEvidence {
  state: 'completed' | 'failed' | 'cancelled' | 'unavailable';
  effect: 'none' | 'possible' | 'confirmed';
  cleanup: 'complete' | 'unknown';
}

export type DesktopErrorCode = 'unavailable' | 'changed' | 'invalid' | 'cancelled' | 'command' | 'limit' | 'cleanup';

export class DesktopError extends Error {
  constructor(code: DesktopErrorCode, message: string);
  readonly code: DesktopErrorCode;
}

export interface NativeFile { readonly path: string; readonly identity: string }

export interface DesktopConfig {
  readonly display: string;
  readonly xdotool: NativeFile;
  readonly ffmpeg: NativeFile;
  readonly xclip?: NativeFile;
  readonly authority?: NativeFile;
  readonly identity: string;
}

export interface NativeRequest {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly effect: boolean;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  readonly env: Readonly<Record<string, string>>;
  readonly onStdout: (chunk: Buffer) => void;
  readonly onStderr: (chunk: Buffer) => void;
  readonly onStdin?: (pipe: { write(chunk: Buffer): Promise<void>; end(): void }) => void;
}

export type RunNative = (request: NativeRequest) => Promise<{
  readonly status: 'completed' | 'failed' | 'timeout' | 'cancelled';
  readonly exitCode: number | null;
  readonly terminationFailed?: boolean;
}>;

export interface DesktopScope {
  readonly signal: AbortSignal;
  readonly evidence: DesktopEvidence;
  check(): void;
  remaining(): number;
  cancel(): void;
}

export interface DesktopOperationHost {
  readonly run: RunNative;
  readonly root: string;
  readonly scope: DesktopScope;
  readonly config: DesktopConfig;
  readonly snapshot?: DesktopSnapshot;
  setSnapshot(snapshot: Omit<DesktopSnapshot, 'id'>): DesktopSnapshot;
  invalidateSnapshot(): void;
  verify(): void;
}

export interface DesktopResult {
  readonly success: true;
  readonly output: string;
  readonly metadata?: Record<string, unknown>;
  readonly images?: readonly { readonly type: 'image'; readonly data: string; readonly mimeType: string }[];
}

export function desktopConfig(env?: NodeJS.ProcessEnv, platform?: string): DesktopConfig;
export function verifyDesktopConfig(config: DesktopConfig): void;
export function desktopOperation(args: Record<string, unknown>, host: DesktopOperationHost): Promise<DesktopResult>;
