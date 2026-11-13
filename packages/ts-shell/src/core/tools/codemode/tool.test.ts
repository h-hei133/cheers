import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '../../../tools/types.js'
import { createCodemodeToolDefinition } from './tool.js'
import { NESTED_CALL_LIMITS, NestedCallRecorder } from './nestedCalls.js'

describe('codemode and NestedToolCallRunner', () => {
  function fixtureRegistry(): Map<string, ToolDefinition> {
    const tools = new Map<string, ToolDefinition>([
      [
        'read',
        {
          name: 'read',
          description: 'Read a file by path',
          argsSchema: {
            type: 'object',
            required: ['path'],
            properties: { path: { type: 'string' } },
          },
          execute: async args => ({
            success: true,
            output: `file:${String(args.path)}:line1\nfile:${String(args.path)}:match`,
          }),
        },
      ],
      [
        'mcp__github__search_issues',
        {
          name: 'mcp__github__search_issues',
          description: 'Search GitHub issues by query text',
          argsSchema: {
            type: 'object',
            required: ['query'],
            properties: { query: { type: 'string', description: 'issue search query' } },
          },
          execute: async args => ({
            success: true,
            output: JSON.stringify([{ number: 42, title: `Bug: ${String(args.query)}` }]),
          }),
        },
      ],
    ])
    tools.set('codemode', createCodemodeToolDefinition(() => tools))
    return tools
  }

  it('batches nested tool calls, filters output, persists store/load, and records nested call telemetry', async () => {
    const registry = fixtureRegistry()
    const codemode = registry.get('codemode')!
    const context = { workspaceRoot: '/workspace', sessionId: 'sess-codemode', taskId: 'cm-1' }

    const first = await codemode.execute(
      {
        code: `
          const [a, b] = await Promise.all([
            tools.read({ path: "a.ts" }),
            tools.read({ path: "b.ts" }),
          ]);
          const hits = [a, b].flatMap(t => t.split("\\n")).filter(line => line.endsWith(":match"));
          await store("savedHits", hits);
          const found = await searchTools("github issue");
          console.log("found tools:", found[0]?.name);
          return hits.join(", ");
        `,
      },
      context,
    )

    expect(first.success).toBe(true)
    expect(first.output).toContain('Script completed')
    expect(first.output).toContain('file:a.ts:match, file:b.ts:match')
    expect(first.output).toContain('<console_output>\nfound tools: mcp__github__search_issues\n</console_output>')
    expect(first.metadata?.nestedCalls).toMatchObject({
      complete: true,
      calls: [
        { id: 'cm-1/1', name: 'read', status: 'ok', arguments: { path: 'a.ts' } },
        { id: 'cm-1/2', name: 'read', status: 'ok', arguments: { path: 'b.ts' } },
      ],
    })

    const second = await codemode.execute(
      {
        code: `
          const prev = await load("savedHits");
          text(prev.length);
          exit();
          text("unreachable");
        `,
      },
      context,
    )
    expect(second.success).toBe(true)
    expect(second.output).toContain('2')
    expect(second.output).not.toContain('unreachable')
  })

  it('enforces sandbox isolation and NestedCallRecorder byte/count limits', async () => {
    const registry = fixtureRegistry()
    const codemode = registry.get('codemode')!
    const failed = await codemode.execute(
      { code: 'return typeof process !== "undefined" ? process.env : "isolated";' },
      { workspaceRoot: '/workspace', sessionId: 'sess-iso', taskId: 'cm-2' },
    )
    expect(failed.success).toBe(true)
    expect(failed.output).toContain('isolated')
    const escapeAttempt = await codemode.execute(
      { code: 'return (() => { try { return ({}).constructor.constructor("return process")(); } catch (e) { return "blocked:" + e.name; } })();' },
      { workspaceRoot: '/workspace', sessionId: 'sess-iso', taskId: 'cm-2' },
    )
    expect(escapeAttempt.success).toBe(true)
    expect(escapeAttempt.output).toContain('blocked:EvalError')

    const asyncLoop = await codemode.execute(
      { code: '// @options: {"timeout_ms": 150}\nawait Promise.resolve(); while (true) {}' },
      { workspaceRoot: '/workspace', sessionId: 'sess-iso', taskId: 'cm-3' },
    )
    expect(asyncLoop.success).toBe(false)
    expect(asyncLoop.error ?? asyncLoop.output).toContain('timed out')

    const recorder = new NestedCallRecorder()
    const oversized = 'x'.repeat(NESTED_CALL_LIMITS.maxArgumentBytesPerCall + 100)
    const rec = recorder.start({ id: 'c/1', name: 'read', arguments: { path: oversized } })
    recorder.finish(rec, false, '')
    const snap = recorder.snapshot()!
    expect(snap.complete).toBe(false)
    expect(snap.calls[0]?.arguments).toBeUndefined()
    expect(snap.calls[0]?.argumentsBytes).toBeGreaterThan(NESTED_CALL_LIMITS.maxArgumentBytesPerCall)
  })

  it('projects TS declarations, resolves $ref, suggests tools, enforces lockdown, and detects stalls', async () => {
    const { schemaToType } = await import('./declarations.js')
    const tsType = schemaToType({
      type: 'object',
      required: ['path'],
      $defs: { Mode: { enum: ['fast', 'safe'] } },
      properties: {
        path: { type: 'string', minLength: 1 },
        mode: { $ref: '#/$defs/Mode' },
      },
    })
    expect(tsType).toContain('path: string; // @minLength 1')
    expect(tsType).toContain('mode?: "fast" | "safe";')

    const registry = fixtureRegistry()
    const codemode = registry.get('codemode')!
    const ctx = { workspaceRoot: '/workspace', sessionId: 'sess-e', taskId: 'cm-e1' }

    const described = await codemode.execute(
      { code: 'const sig = await describeTool("read"); const ns = await describeNamespace("mcp_github"); return { sig, ns, hasModels: Array.isArray(models.list()) };' },
      ctx,
    )
    expect(described.success).toBe(true)
    expect(described.output).toContain('tools.read(args:')
    expect(described.output).toContain('"hasModels": true')

    const typo = await codemode.execute({ code: 'return await tools.reed({ path: "a.ts" });' }, ctx)
    expect(typo.success).toBe(false)
    expect(typo.error ?? typo.output).toContain('Did you mean: read?')
    const locked = await codemode.execute(
      { code: 'try { Object.prototype.polluted = 1; return "mutated"; } catch (e) { return "locked:" + e.name; }' },
      ctx,
    )
    expect(locked.success).toBe(true)
    expect(locked.output).toContain('locked:TypeError')

    const stalled = await codemode.execute({ code: 'await new Promise(() => {});' }, ctx)
    expect(stalled.success).toBe(false)
    expect(stalled.error ?? stalled.output).toContain('stalled')
  })

  it('validates image() magic bytes, rolls back failed store writes, and replays branch-scoped store entries', async () => {
    const { replayCodemodeBranchStore } = await import('./store.js')
    const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
    const registry = fixtureRegistry()
    const codemode = registry.get('codemode')!
    const ctx = { workspaceRoot: '/workspace', sessionId: 'sess-img', taskId: 'cm-img' }

    const okImg = await codemode.execute(
      { code: `await image("data:image/png;base64,${pngB64}"); store("k", "committed"); return "ok";` },
      ctx,
    )
    expect(okImg.success).toBe(true)
    expect(okImg.images).toEqual([{ type: 'image', data: pngB64, mimeType: 'image/png' }])

    const failedWrite = await codemode.execute(
      { code: 'store("k", "aborted"); throw new Error("boom");' },
      ctx,
    )
    expect(failedWrite.success).toBe(false)
    const check = await codemode.execute({ code: 'return load("k");' }, ctx)
    expect(check.output).toContain('committed')

    const badImg = await codemode.execute({ code: 'await image("data:image/png;base64,bm90LXBuZw==");' }, ctx)
    expect(badImg.success).toBe(false)
    expect(badImg.error ?? badImg.output).toContain('valid PNG, JPEG, GIF, or WebP')
    const replayed = replayCodemodeBranchStore(
      [
        { type: 'codemode-store', sourceEntryId: 'e1', entries: { branch: JSON.stringify('main') }, timestamp: 't1' },
        { type: 'codemode-store', sourceEntryId: 'e2-abandoned', entries: { branch: JSON.stringify('other') }, timestamp: 't2' },
        { type: 'codemode-store', sourceEntryId: 'e3', entries: { extra: JSON.stringify(42) }, timestamp: 't3' },
      ],
      ['e1', 'e3'],
    )
    expect(replayed.get('branch')).toBe('"main"')
    expect(replayed.get('extra')).toBe('42')
  })
})
