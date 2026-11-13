import { locateExistingSessionLayout, createSessionStoreLayout } from '../../../session/store/sessionFileLayout.js'
import { loadSessionRecord } from '../../../session/store/sessionStore.js'
import { readSessionThreadSnapshot } from '../../../session/store/threadState.js'
import { sessionThreadPath } from '../../../session/schema/sessionThread.js'
import { createTranscriptEntryId, type CodemodeStoreTranscriptEntry, type TranscriptEvent } from '../../../session/sessionEventCodec.js'
import { appendTranscriptEvent, readTranscriptEvents } from '../../../session/transcript/sessionTranscript.js'

export const MAX_STORE_VALUE_CHARS = 256 * 1024
export const MAX_STORE_TOTAL_CHARS = 1024 * 1024
const MAX_MEMORY_SESSIONS = 64

const memoryStores = new Map<string, Map<string, string>>()

export function clearCodemodeStore(sessionId: string): void {
  memoryStores.delete(sessionId)
}

function getMemoryStore(sessionId: string): Map<string, string> {
  let store = memoryStores.get(sessionId)
  if (!store) {
    if (memoryStores.size >= MAX_MEMORY_SESSIONS) {
      const oldest = memoryStores.keys().next().value
      if (oldest !== undefined) memoryStores.delete(oldest)
    }
    store = new Map()
    memoryStores.set(sessionId, store)
  }
  return store
}

/** Replay `codemode-store` entries along the active branch path from root to leaf. */
export function replayCodemodeBranchStore(
  events: readonly TranscriptEvent[],
  activeEntryIds?: readonly string[],
): Map<string, string> {
  const onBranch = activeEntryIds ? new Set(activeEntryIds) : undefined
  const store = new Map<string, string>()
  for (const event of events) {
    if (event.type !== 'codemode-store') continue
    if (onBranch && event.sourceEntryId && !onBranch.has(event.sourceEntryId)) continue
    for (const [key, val] of Object.entries(event.entries)) {
      if (val === null) store.delete(key)
      else store.set(key, val)
    }
  }
  return store
}

function resolveSessionContext(sessionId: string, cwd?: string): {
  readonly transcriptPath: string
  readonly activeEntryIds: readonly string[]
  readonly activeLeafId?: string
} | undefined {
  try {
    const layout = locateExistingSessionLayout(createSessionStoreLayout(), sessionId)
    const session = loadSessionRecord({ sessionId, layout, cwd: cwd ?? process.cwd() })
    const thread = readSessionThreadSnapshot({ session, layout })
    const pathResult = sessionThreadPath(thread, thread.activeLeafId ?? undefined)
    const activeEntryIds = pathResult.path.map(entry => entry.id)
    return {
      transcriptPath: layout.transcriptPath,
      activeEntryIds,
      ...(thread.activeLeafId ? { activeLeafId: thread.activeLeafId } : {}),
    }
  } catch {
    return undefined
  }
}

function assertStoreBudget(base: ReadonlyMap<string, string>, writes: Readonly<Record<string, string | null>>): void {
  let total = 0
  for (const [k, v] of base.entries()) {
    if (!Object.hasOwn(writes, k)) total += k.length + v.length
  }
  for (const [k, v] of Object.entries(writes)) {
    if (v !== null) total += k.length + v.length
  }
  if (total > MAX_STORE_TOTAL_CHARS) {
    throw new Error(`codemode store exceeded ${MAX_STORE_TOTAL_CHARS} character limit.`)
  }
}

export function loadCodemodeStore(sessionId: string | undefined, cwd?: string): {
  readonly initial: Record<string, string>
  readonly commit: (writes: Readonly<Record<string, string | null>>) => void
} {
  if (!sessionId) {
    return { initial: {}, commit: () => {} }
  }
  const disk = resolveSessionContext(sessionId, cwd)
  if (disk) {
    const events = readTranscriptEvents(disk.transcriptPath)
    const replayed = replayCodemodeBranchStore(events, disk.activeEntryIds)
    return {
      initial: Object.fromEntries(replayed.entries()),
      commit: (writes) => {
        if (Object.keys(writes).length === 0) return
        assertStoreBudget(replayed, writes)
        const entry: CodemodeStoreTranscriptEntry = {
          type: 'codemode-store',
          id: createTranscriptEntryId('cm'),
          ...(disk.activeLeafId ? { sourceEntryId: disk.activeLeafId } : {}),
          entries: writes,
          timestamp: new Date().toISOString(),
        }
        appendTranscriptEvent(disk.transcriptPath, entry)
      },
    }
  }
  const mem = getMemoryStore(sessionId)
  return {
    initial: Object.fromEntries(mem.entries()),
    commit: (writes) => {
      assertStoreBudget(mem, writes)
      for (const [k, v] of Object.entries(writes)) {
        if (v === null) mem.delete(k)
        else mem.set(k, v)
      }
    },
  }
}
