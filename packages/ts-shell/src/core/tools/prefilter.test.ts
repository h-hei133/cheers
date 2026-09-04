import { describe, expect, it } from 'vitest'
import { filterVisibleToolNames } from './prefilter.js'

describe('tool capability prefilter', () => {
  it('hides explicitly disabled tools', () => {
    const visible = filterVisibleToolNames(
      ['read', 'write', 'bash'],
      {
        provider: 'openai',
        daemonEnabled: false,
        maxTurns: 6,
        disabledTools: ['bash'],
        hiddenToolPrefixes: [],
        enableMcpTools: true,
        configSources: [],
      },
    )

    expect(visible).toEqual(['read', 'write'])
  })

  it('hides MCP tools when MCP visibility is disabled', () => {
    const visible = filterVisibleToolNames(
      ['read', 'mcp__server__tool', 'mcp__other__search'],
      {
        provider: 'openai',
        daemonEnabled: false,
        maxTurns: 6,
        disabledTools: [],
        hiddenToolPrefixes: [],
        enableMcpTools: false,
        configSources: [],
      },
    )

    expect(visible).toEqual(['read'])
  })

  it('hides tools by prefix before model exposure', () => {
    const visible = filterVisibleToolNames(
      ['read', 'git-status', 'mcp__server__danger'],
      {
        provider: 'openai',
        daemonEnabled: false,
        maxTurns: 6,
        disabledTools: [],
        hiddenToolPrefixes: ['git-', 'mcp__server__'],
        enableMcpTools: true,
        configSources: [],
      },
    )

    expect(visible).toEqual(['read'])
  })

  it('applies combined MCP + disabled + prefix rules deterministically', () => {
    const visible = filterVisibleToolNames(
      ['read', 'bash', 'git-status', 'mcp__serverA__search', 'mcp__serverB__danger'],
      {
        provider: 'openai',
        daemonEnabled: true,
        maxTurns: 6,
        disabledTools: ['bash'],
        hiddenToolPrefixes: ['git-', 'mcp__serverB__'],
        enableMcpTools: true,
        configSources: [],
      },
    )

    expect(visible).toEqual(['read', 'mcp__serverA__search'])
  })
})
