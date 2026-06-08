import { describe, expect, it } from 'vitest'
import { contextResultSourceFacts, normalizeRuntimeSourceFacts, sourceFactsForTargets } from './source.js'

describe('runtime source facts', () => {
  it('normalizes and deduplicates source facts', () => {
    const facts = normalizeRuntimeSourceFacts([
      { factId: 'source:rate', path: 'src/rate.mjs', summary: 'rate equals 2', confidence: 'high' },
      { factId: 'source:rate', path: 'src/rate.mjs', summary: 'rate equals 4', confidence: 'medium' },
      { factId: '', path: '', summary: '', confidence: 'low' },
    ])

    expect(facts).toEqual([
      { factId: 'source:rate', path: 'src/rate.mjs', summary: 'rate equals 4', confidence: 'medium' },
    ])
  })

  it('selects facts by target path or fact id', () => {
    const facts = sourceFactsForTargets({
      facts: [
        { factId: 'source:rate', path: 'src/rate.mjs', summary: 'rate equals 2', confidence: 'high' },
        { factId: 'source:other', path: 'src/other.mjs', summary: 'other equals 1', confidence: 'low' },
      ],
      targetFiles: ['src/other.mjs'],
      sourceFactIds: ['source:rate'],
    })

    expect(facts.map((fact) => fact.factId)).toEqual(['source:rate', 'source:other'])
  })

  it('requires explicit source facts instead of synthesizing them from diagnostics', () => {
    expect(contextResultSourceFacts({
      toolId: 'read-empty',
      paths: ['src/rate.mjs'],
      diagnosticSummary: 'source unavailable',
      sourceFacts: [],
    })).toEqual([])

    expect(contextResultSourceFacts({
      toolId: 'read-rate',
      paths: ['src/rate.mjs'],
      diagnosticSummary: 'rate currently equals 2',
    })).toEqual([])

    expect(contextResultSourceFacts({
      toolId: 'read-path',
      paths: ['src/path.mjs'],
    })).toEqual([])
  })
})
