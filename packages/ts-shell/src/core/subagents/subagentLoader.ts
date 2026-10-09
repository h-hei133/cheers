import fs from 'node:fs';
import path from 'node:path';
import type { SubagentDefinition } from './types.js';
import { resolveUserDataFile } from '../paths/userHome.js';
import { BUILTIN_SUBAGENTS } from './builtin.js';
import { parseDefinition } from './definition.js';
import { definitionIdentity, pathIdentity, readAgentFile } from './files.js';

export interface AgentCandidate {
  readonly name: string; readonly source: SubagentDefinition['source']; readonly filePath?: string;
  readonly definition?: SubagentDefinition; readonly raw?: string; readonly diagnostic?: string;
}
export interface AgentDiscovery {
  readonly effective: ReadonlyMap<string, AgentCandidate>;
  readonly candidates: readonly AgentCandidate[];
  readonly diagnostics: readonly string[];
}
export class SubagentLoader {
  readonly workspaceRoot: string;
  readonly userAgentsDir: string;
  constructor(workspaceRoot = process.cwd(), private readonly sourceAccess?: (absolute: string) => void) {
    this.workspaceRoot = path.resolve(workspaceRoot); this.userAgentsDir = resolveUserDataFile('agents');
  }
  directories(): readonly string[] { return [this.userAgentsDir, path.join(this.workspaceRoot, '.agents', 'agents'), path.join(this.workspaceRoot, '.agents')]; }
  discover(allowProjectAgents = true): AgentDiscovery {
    const candidates: AgentCandidate[] = BUILTIN_SUBAGENTS.map(definition => ({ name: definition.name, source: 'builtin', definition: { ...definition, identity: `builtin:${definition.name}` } }));
    const diagnostics: string[] = []; const budget = { files: 0, bytes: 0 };
    this.scan(this.userAgentsDir, 'user', candidates, diagnostics, budget, 0);
    if (allowProjectAgents) {
      this.scan(this.directories()[1]!, 'project', candidates, diagnostics, budget, 0);
      this.scan(this.directories()[2]!, 'project', candidates, diagnostics, budget, 0, true);
    } else diagnostics.push('Project definitions are excluded because this workspace is untrusted.');
    const effective = new Map<string, AgentCandidate>();
    for (const candidate of candidates) effective.set(candidate.name.toLowerCase(), candidate);
    return { effective, candidates, diagnostics };
  }
  loadAllSubagents(allowProjectAgents = true): ReadonlyMap<string, SubagentDefinition> {
    const registry = new Map<string, SubagentDefinition>();
    for (const [name, candidate] of this.discover(allowProjectAgents).effective) {
      if (candidate.definition && candidate.definition.enabled !== false) registry.set(name, candidate.definition);
    }
    return registry;
  }
  getSubagent(name: string, allowProjectAgents = true): SubagentDefinition | undefined { return this.loadAllSubagents(allowProjectAgents).get(name.trim().toLowerCase()); }
  private scan(directory: string, source: 'user' | 'project', candidates: AgentCandidate[], diagnostics: string[], budget: { files: number; bytes: number }, depth: number, skipAgents = false): void {
    try {
      pathIdentity(directory);
      let entries: fs.Dirent[];
      try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory() && !entry.name.startsWith('.') && !(skipAgents && entry.name === 'agents')) {
          if (depth >= 6) { diagnostics.push(`${target}: discovery depth limit reached.`); continue; }
          this.scan(target, source, candidates, diagnostics, budget, depth + 1); continue;
        }
        if (!entry.name.endsWith('.md')) continue;
        if (++budget.files > 512 || budget.bytes > 8 * 1024 * 1024) { diagnostics.push(`${directory}: discovery file/byte limit reached.`); return; }
        const fallbackName = entry.name.replace(/(?:\.agent)?\.md$/, '');
        let raw: string | undefined;
        let sourceAdmitted = false;
        try {
          this.sourceAccess?.(target); sourceAdmitted = true;
          raw = readAgentFile(target); if (raw === undefined) throw new Error('Definition disappeared.');
          budget.bytes += Buffer.byteLength(raw);
          const parsed = parseDefinition(raw, source, target, false);
          candidates.push({ name: parsed.name, source, filePath: target, raw, definition: { ...parsed, identity: definitionIdentity(target, raw) } });
        } catch (error) {
          const diagnostic = !sourceAdmitted ? 'Definition source refused or unreadable.' : error instanceof Error ? error.message : 'Definition is unreadable.';
          const declared = raw?.match(/^name:\s*["']?([a-zA-Z0-9_-]{1,64})["']?\s*$/m)?.[1];
          candidates.push({ name: declared ?? fallbackName, source, filePath: target, diagnostic });
          diagnostics.push(`${target}: ${diagnostic}`);
        }
      }
    } catch { diagnostics.push(`${directory}: agent directory is unreadable or traverses an unsafe path.`); }
  }
}
