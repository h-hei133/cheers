import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getCandidateConfigPaths, getRuntimeConfig } from './runtimeConfig.js'

describe('runtime config', () => {
  const originalHome = process.env.USERPROFILE
  let fakeHome: string
  let fakeRoot: string

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-home-'))
    fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-root-'))
    process.env.USERPROFILE = fakeHome
    delete process.env.DAEMON_ENABLED
    delete process.env.PRIVATE_AGENTS_MAX_TURNS
  })

  afterEach(() => {
    process.env.USERPROFILE = originalHome
    delete process.env.DAEMON_ENABLED
    delete process.env.PRIVATE_AGENTS_MAX_TURNS
    fs.rmSync(fakeHome, { recursive: true, force: true })
    fs.rmSync(fakeRoot, { recursive: true, force: true })
  })

  it('loads defaults when no config file exists', () => {
    const config = getRuntimeConfig(fakeRoot)
    expect(config).toEqual({
      provider: 'openai',
      daemonEnabled: true,
      maxTurns: 6,
      disabledTools: [],
      hiddenToolPrefixes: [],
      enableMcpTools: true,
      configSources: [],
    })
  })

  it('loads project config and env overrides', () => {
    const configPath = path.join(fakeRoot, '.private-agents.json')
    fs.writeFileSync(configPath, JSON.stringify({ daemonEnabled: false, maxTurns: 9 }), 'utf8')
    process.env.DAEMON_ENABLED = '1'
    process.env.PRIVATE_AGENTS_MAX_TURNS = '12'

    const config = getRuntimeConfig(fakeRoot)
    expect(config.provider).toBe('openai')
    expect(config.daemonEnabled).toBe(true)
    expect(config.maxTurns).toBe(12)
    expect(config.configSources).toContain(configPath)
  })

  it('returns stable candidate paths', () => {
    const candidates = getCandidateConfigPaths(fakeRoot)
    expect(candidates[0]).toContain('.private-agents')
    expect(candidates[1]).toBe(path.join(fakeRoot, '.private-agents.json'))
  })
})
