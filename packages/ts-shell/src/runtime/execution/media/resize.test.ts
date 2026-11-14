import { afterEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import * as local from '../local.js';
import { createMediaReader } from './index.js';
import { inspectImage } from '../../../model-adapters/image/input.js';
import which from 'which';

vi.mock('which', async () => {
  const actual = await vi.importActual<{ default: typeof which }>('which');
  return { default: Object.assign(vi.fn(actual.default), { sync: actual.default.sync }) };
});
afterEach(() => { vi.restoreAllMocks(); });
const data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const image = { type: 'image' as const, mimeType: 'image/png', data };
function jpeg(width: number, height: number): Buffer {
  const bytes = Buffer.from([255, 216, 255, 192, 0, 17, 8, 0, 1, 0, 1, 3, 1, 34, 0, 2, 17, 1, 3, 17, 1, 255, 217]);
  bytes.writeUInt16BE(height, 7); bytes.writeUInt16BE(width, 9); return bytes;
}

it('runs inline resize through the existing unlinked descriptor and resource-limited native execution', async () => {
  vi.mocked(which).mockResolvedValue('/mock/native');
  const calls: Parameters<typeof local.executeLocally>[0][] = [];
  vi.spyOn(local, 'executeLocally').mockImplementation(async options => {
    calls.push(options);
    expect(options.args).toContain('--as=536870912');
    expect(options.args).toContain('--fsize=0');
    const descriptor = options.readDescriptors![0]!;
    expect(await fs.readlink('/proc/self/fd/' + descriptor)).toContain('(deleted)');
    expect(await fs.readFile('/proc/self/fd/' + descriptor)).toEqual(Buffer.from(data, 'base64'));
    options.onStdout?.(options.args.includes('-show_entries')
      ? Buffer.from('{"streams":[{"codec_name":"png","width":4,"height":2}]}') : jpeg(2, 1));
    return { status: 'completed', exitCode: 0, stdout: '', stderr: '' };
  });
  const reader = createMediaReader();
  const result = await reader.resize(image, { maxWidth: 2, maxHeight: 1, maxBytes: 1000, jpegQuality: 40 }, process.cwd());
  expect(inspectImage(result)).toMatchObject({ widthPx: 2, heightPx: 1 });
  expect(calls).toHaveLength(2);
  expect(calls[1]!.args).toContain("scale=w='min(2,iw)':h='min(1,ih)':force_original_aspect_ratio=decrease");
  expect(calls[1]!.args[calls[1]!.args.indexOf('-q:v') + 1]).toBe('20');
  await expect(fs.readFile('/proc/self/fd/' + calls[0]!.readDescriptors![0])).rejects.toThrow();
});

it('reduces dimensions again when native output exceeds the model byte ceiling', async () => {
  vi.mocked(which).mockResolvedValue('/mock/native');
  let encodings = 0;
  const filters: string[] = [];
  vi.spyOn(local, 'executeLocally').mockImplementation(async options => {
    if (options.args.includes('-show_entries')) options.onStdout?.(Buffer.from('{"streams":[{"codec_name":"png","width":4,"height":4}]}'));
    else {
      filters.push(options.args[options.args.indexOf('-vf') + 1]!);
      options.onStdout?.(++encodings === 1 ? Buffer.alloc(65) : jpeg(2, 2));
    }
    return { status: 'completed', exitCode: 0, stdout: '', stderr: '' };
  });
  const result = await createMediaReader().resize(image, { maxWidth: 4, maxHeight: 4, maxBytes: 64 }, process.cwd());
  expect(inspectImage(result).bytes).toBeLessThanOrEqual(64);
  expect(filters).toEqual(["scale=w='min(4,iw)':h='min(4,ih)':force_original_aspect_ratio=decrease",
    "scale=w='min(2,iw)':h='min(2,ih)':force_original_aspect_ratio=decrease"]);
});

it('rejects a byte ceiling that cannot hold even a one-pixel native image', async () => {
  vi.mocked(which).mockResolvedValue('/mock/native');
  let encodings = 0;
  vi.spyOn(local, 'executeLocally').mockImplementation(async options => {
    if (options.args.includes('-show_entries')) options.onStdout?.(Buffer.from('{"streams":[{"codec_name":"png","width":1,"height":1}]}'));
    else { encodings++; options.onStdout?.(jpeg(1, 1)); }
    return { status: 'completed', exitCode: 0, stdout: '', stderr: '' };
  });
  await expect(createMediaReader().resize(image, { maxWidth: 1, maxHeight: 1, maxBytes: 1 }, process.cwd())).rejects.toMatchObject({ reason: 'output' });
  expect(encodings).toBe(1);
});

it('seals the same reader for file and inline media after native cleanup cannot be verified', async () => {
  vi.mocked(which).mockResolvedValue('/mock/native');
  const execute = vi.spyOn(local, 'executeLocally').mockResolvedValue({ status: 'failed', exitCode: null, stdout: '', stderr: 'PRIVATE_DECODER_TEXT', failureKind: 'execution_failure' });
  const reader = createMediaReader();
  await expect(reader.resize(image, { maxWidth: 1 }, process.cwd())).rejects.toMatchObject({ reason: 'cleanup' });
  await expect(reader.resize(image, { maxWidth: 1 }, process.cwd())).rejects.toMatchObject({ reason: 'cleanup' });
  expect(execute).toHaveBeenCalledOnce();
});

it('rejects cancelled inline work before staging or native launch', async () => {
  const controller = new AbortController(); controller.abort();
  const execute = vi.spyOn(local, 'executeLocally');
  await expect(createMediaReader().resize(image, { maxWidth: 1 }, process.cwd(), controller.signal)).rejects.toThrow();
  expect(execute).not.toHaveBeenCalled();
});

it('resizes a real native inline image when the existing Linux tools are available', async () => {
  vi.mocked(which).mockImplementation((await vi.importActual<{ default: typeof which }>('which')).default);
  const available = process.platform === 'linux' && ['ffmpeg', 'ffprobe', 'prlimit'].every(name => which.sync(name, { nothrow: true }));
  if (!available) {
    await expect(createMediaReader().resize(image, { maxWidth: 1, maxHeight: 1, maxBytes: 1000 }, process.cwd())).rejects.toMatchObject({ reason: 'unavailable' });
    return;
  }
  const result = await createMediaReader().resize(image, { maxWidth: 1, maxHeight: 1, maxBytes: 1000, jpegQuality: 80 }, process.cwd());
  expect(result.mimeType).toBe('image/jpeg');
  expect(inspectImage(result)).toMatchObject({ widthPx: 1, heightPx: 1 });
  expect(inspectImage(result).bytes).toBeLessThanOrEqual(1000);
}, 20_000);
