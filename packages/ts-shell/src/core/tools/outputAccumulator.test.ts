import { describe, expect, it } from 'vitest'
import { OutputAccumulator } from './outputAccumulator.js'

describe('OutputAccumulator', () => {
  it('tracks streaming UTF-8 chunks with bounded rolling tail', () => {
    const acc = new OutputAccumulator({ maxLines: 5, maxBytes: 128 })
    for (let i = 1; i <= 20; i++) {
      acc.append(Buffer.from(`line-${i}: ${'x'.repeat(20)}\n`, 'utf8'))
    }
    acc.finish()
    const snap = acc.snapshot()
    expect(snap.truncation.truncated).toBe(true)
    expect(snap.totalLines).toBe(20)
    expect(snap.content).toContain('line-20:')
    expect(snap.content).not.toContain('line-1:')
  })
})
