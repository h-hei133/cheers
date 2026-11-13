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
})
