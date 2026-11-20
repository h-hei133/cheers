export interface ImageContent {
  readonly type: 'image';
  readonly data: string;
  readonly mimeType: string;
}

export interface ResizeOptions {
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxBytes?: number;
  readonly jpegQuality?: number;
}

export interface MediaSource {
  readonly fd: number;
  readonly bytes: number;
  readonly hash: string;
  readonly signature: Buffer;
  readonly deadline: number;
  readonly verify: () => Promise<void>;
}

export type MediaProcess = (source: MediaSource, cwd: string, command: string, args: readonly string[],
  outputLimit: number, signal?: AbortSignal, permissionExitCode?: number) => Promise<Buffer>;

export type DecodeFailure = 'format' | 'pixels' | 'pages' | 'output' | 'decode' | 'encrypted';

export interface MediaPorts {
  readonly run: MediaProcess;
  readonly fail: (reason: DecodeFailure) => never;
  readonly isOutputLimit: (error: unknown) => boolean;
  readonly imageMime: (signature: Buffer) => string | undefined;
  readonly canonicalImageMime: (mimeType: string) => string;
}

export interface MediaReadResult {
  readonly output: string;
  readonly images?: readonly ImageContent[];
  readonly metadata: Record<string, unknown>;
}

export interface DecodeRequest {
  readonly workspaceRoot: string;
  readonly abortSignal?: AbortSignal;
}

export interface ImageReadRequest extends DecodeRequest {
  readonly absolutePath: string;
}

export interface PdfReadRequest extends DecodeRequest {
  readonly offset?: number;
  readonly limit?: number;
}

export function readImage(ports: MediaPorts, request: ImageReadRequest, source: MediaSource): Promise<MediaReadResult>;
export function readPdf(ports: MediaPorts, request: PdfReadRequest, source: MediaSource): Promise<MediaReadResult>;
export function resizeInlineImage(ports: MediaPorts, image: ImageContent, source: MediaSource, resize: ResizeOptions,
  cwd: string, signal?: AbortSignal): Promise<ImageContent>;
