import { describe, expect, it, vi } from 'vitest';
import { captureInput, captureSchema } from './capture.js';
import { compileValidator } from './compiler.js';
import { validateToolArguments } from '../tools/arguments.js';
import { createCoreToolRegistry } from '../tools/registry.js';
import { createDefaultExecutionService } from '../../runtime/execution/service.js';

function nested(depth: number): Record<string, unknown> {
  let value: Record<string, unknown> = {};
  for (let index = 0; index < depth; index += 1) value = { value };
  return value;
}

describe('bounded validation capture', () => {
  it('counts UTF-8 schema bytes and refuses oversized schemas before compilation', () => {
    expect(captureSchema({ description: '界'.repeat(300_000) }).source).toContain('description');
    expect(() => compileValidator({ description: '界'.repeat(350_000) })).toThrow('Validation schema is invalid or unsupported.');
  });

  it('bounds annotation node counts and schema depth while retaining ordinary nested data', () => {
    expect(captureSchema({ default: Array.from({ length: 24_000 }, () => 0) }).schema).toHaveProperty('default');
    expect(() => captureSchema({ default: Array.from({ length: 25_001 }, () => 0) })).toThrow();
    expect(() => captureSchema({ default: nested(63) })).not.toThrow();
    expect(() => captureSchema({ default: nested(64) })).toThrow();
  });

  it('bounds input bytes, node counts and depth without changing caller data', () => {
    const input = { value: '界'.repeat(350_000) };
    const validate = compileValidator({ type: 'object', properties: { value: { type: 'string' } }, additionalProperties: false });
    expect(validate(input)).toBe(true);
    expect(input.value.length).toBe(350_000);
    expect(() => captureInput('x'.repeat(67_108_865))).toThrow('Validation data exceeds its limit.');
    expect(captureInput(Array.from({ length: 249_999 }, () => 0))).toHaveLength(249_999);
    expect(() => captureInput(Array.from({ length: 250_000 }, () => 0))).toThrow();
    expect(() => captureInput(nested(128))).not.toThrow();
    expect(() => captureInput(nested(129))).toThrow();
  });

  it('refuses cyclic data, proxies and accessors without executing user code', () => {
    let invoked = 0;
    const cyclic: Record<string, unknown> = {};
    cyclic.value = cyclic;
    expect(() => captureInput(cyclic)).toThrow('Validation data must be inert.');
    const proxy = new Proxy({}, { ownKeys() { invoked += 1; return []; } });
    expect(() => captureInput(proxy)).toThrow();
    const getter = Object.defineProperty({}, 'value', { enumerable: true, get() { invoked += 1; return 1; } });
    expect(() => captureInput(getter)).toThrow('Validation data cannot contain accessors.');
    expect(invoked).toBe(0);
  });

  it('rejects structural overflow through the actual write boundary before any effect', async () => {
    const service = createDefaultExecutionService();
    const read = vi.spyOn(service, 'readTextFile').mockResolvedValue('original');
    const write = vi.spyOn(service, 'writeTextFile').mockResolvedValue(undefined);
    const tool = createCoreToolRegistry({ executionService: service }).get('write')!;
    await expect(tool.execute({ path: 'target.txt', content: 'valid', extra: nested(128) },
      { workspaceRoot: process.cwd(), taskId: 'bounded-validation' })).rejects.toThrow('Invalid tool arguments');
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(() => validateToolArguments({ type: 'object' }, { extra: nested(128) })).toThrow('Invalid tool arguments');
  });
});
