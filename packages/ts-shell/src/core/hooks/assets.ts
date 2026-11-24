import { createHash } from 'node:crypto';
import { constants, existsSync, lstatSync, openSync, readSync, closeSync, fstatSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { brotliDecompressSync } from 'node:zlib';
import { assertProfileStorage, currentProfile } from '../paths/profile/context.js';
import { assertUnlinkedPath } from '../paths/profile/identity.js';
import { publishTextArtifact } from '../session/artifacts/publication.js';
import { isRecord } from '../values/record.js';

const MAX_BUNDLE_BYTES = 8 * 1024 * 1024;
const MAX_COMPRESSED_BYTES = 2 * 1024 * 1024;
const ASSET_PATHS = { write: 'bundled:write', stop: 'bundled:stop' } as const;
const nativeRequire = createRequire(import.meta.url);

interface BundledHookAsset {
  readonly sha256: string;
  readonly bytes: number;
  readonly data: string;
}

interface HookAssetRecord {
  readonly version: 1;
  readonly sourceCommit: string;
  readonly gates: { readonly write: BundledHookAsset; readonly stop: BundledHookAsset };
}

export function isBundledHookPath(value: unknown, kind: 'write' | 'stop'): boolean {
  return value === ASSET_PATHS[kind];
}

export function bundledHookCommand(kind: 'write' | 'stop', digest: string): string {
  return `bundled-hook ${kind} ${digest}`;
}

export function bundledHookDeclarations() {
  const { gates } = hookAssetRecord();
  const descriptor = (kind: 'write' | 'stop') => ({ version: 1, path: ASSET_PATHS[kind],
    sha256: gates[kind].sha256, nodeFloor: '20.3.0' });
  return { PreToolUse: [{ matcher: '^(?:Write|Edit|MultiEdit|NotebookEdit)$', hooks: [
    { writeGate: { ...descriptor('write'), protocolVersion: 2, workerProtocol: 1 }, timeoutMs: 15_000 },
  ] }], Stop: [{ hooks: [{ completionGate: descriptor('stop'), timeoutMs: 20_000 }] }] };
}

/** Copy the pinned bytes into the current user's profile, never into the inspected workspace. */
export async function materializeHookAsset(kind: 'write' | 'stop', expectedDigest: string,
  admitted: () => void, signal?: AbortSignal): Promise<string> {
  const profile = currentProfile();
  if (!profile) throw new Error('The active profile is unavailable.');
  const record = hookAssetRecord();
  const asset = record.gates[kind];
  if (asset.sha256 !== expectedDigest) throw new Error('The bundled artifact digest does not match its declaration.');
  const directory = path.join(profile.root, 'hook-artifacts');
  const filename = `${kind}-${expectedDigest}.mjs`;
  const target = path.join(directory, filename);
  const admit = () => {
    signal?.throwIfAborted();
    admitted();
    assertProfileStorage(target, profile);
    assertUnlinkedPath(target);
  };
  admit();
  if (!existsSync(target)) {
    const bytes = brotliDecompressSync(Buffer.from(asset.data, 'base64'), { maxOutputLength: MAX_BUNDLE_BYTES });
    if (bytes.byteLength !== asset.bytes || digest(bytes) !== expectedDigest) {
      throw new Error('The bundled artifact bytes could not be verified.');
    }
    const receipt = await publishTextArtifact(profile.root, directory, filename, bytes, signal, admit);
    if (receipt.sha256 !== expectedDigest || receipt.totalBytes !== asset.bytes) {
      throw new Error('The profile artifact publication could not be verified.');
    }
  }
  admit();
  if (!verifyFile(target, expectedDigest, asset.bytes)) throw new Error('The profile artifact failed digest verification.');
  admit();
  return target;
}

let assets: HookAssetRecord | undefined;

function hookAssetRecord(): HookAssetRecord {
  if (assets) return assets;
  const value = (typeof require === 'function' ? require('./assets.json') : nativeRequire('./assets.json')) as unknown;
  if (!isRecord(value) || value.version !== 1 || typeof value.sourceCommit !== 'string'
    || !/^[a-f0-9]{40}$/.test(value.sourceCommit) || !isRecord(value.gates)
    || !validAsset(value.gates.write) || !validAsset(value.gates.stop)) {
    throw new Error('The bundled hook artifact manifest is invalid.');
  }
  assets = value as unknown as HookAssetRecord;
  return assets;
}

function validAsset(value: unknown): value is BundledHookAsset {
  return isRecord(value) && typeof value.sha256 === 'string' && /^[a-f0-9]{64}$/.test(value.sha256)
    && Number.isSafeInteger(value.bytes) && Number(value.bytes) > 0 && Number(value.bytes) <= MAX_BUNDLE_BYTES
    && typeof value.data === 'string' && value.data.length > 0 && value.data.length <= MAX_COMPRESSED_BYTES * 2
    && value.data.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value.data);
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function verifyFile(file: string, expectedDigest: string, expectedBytes: number): boolean {
  let descriptor: number | undefined;
  try {
    const pathStat = lstatSync(file, { bigint: true });
    if (!pathStat.isFile() || pathStat.size !== BigInt(expectedBytes)) return false;
    descriptor = openSync(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.dev !== pathStat.dev || opened.ino !== pathStat.ino || opened.size !== pathStat.size) return false;
    const hash = createHash('sha256');
    const bytes = Buffer.alloc(64 * 1024);
    let offset = 0;
    while (offset < expectedBytes) {
      const count = readSync(descriptor, bytes, 0, Math.min(bytes.length, expectedBytes - offset), offset);
      if (count === 0) return false;
      hash.update(bytes.subarray(0, count));
      offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(file, { bigint: true });
    return realpathSync(file) === file && opened.size === after.size && opened.mtimeNs === after.mtimeNs
      && opened.ctimeNs === after.ctimeNs && current.isFile() && current.dev === after.dev && current.ino === after.ino
      && current.size === after.size && current.ctimeNs === after.ctimeNs && hash.digest('hex') === expectedDigest;
  } catch { return false; }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}
