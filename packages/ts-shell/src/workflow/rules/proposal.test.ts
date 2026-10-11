import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { prepareRuleProposal, proposeRules } from './proposal.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

describe('rule proposals', () => {
  it('refuses a symlink, bounded metadata failure and read denial without treating them as absence', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-rule-')); roots.push(root);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-rule-outside-')); roots.push(outside);
    fs.writeFileSync(path.join(outside, 'private'), 'external fixture');
    fs.symlinkSync(path.join(outside, 'private'), path.join(root, 'AGENTS.md'));
    expect(() => proposeRules(root, 'init')).toThrow('symlink');
    fs.unlinkSync(path.join(root, 'AGENTS.md'));
    fs.writeFileSync(path.join(root, 'package.json'), ' '.repeat(128 * 1024 + 1));
    expect(() => proposeRules(root, 'init')).toThrow('size limit');
    expect(() => proposeRules(root, 'feedback', 'test', () => { throw new Error('source denied'); })).toThrow('source denied');
  });
  it('preserves existing rule content and does not invent unknown commands', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-rule-')); roots.push(root);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Keep source files small.\n', 'utf8');
    const proposal = proposeRules(root, 'init');
    expect(proposal.before).toBe('Keep source files small.\n');
    expect(proposal.after).toContain('Keep source files small.');
    expect(proposal.after).toContain('No recognized project manifest');
    expect(proposal.after).not.toContain('npm test');
    expect(proposal.write).toBe('append');
  });

  it('turns explicit feedback into a preview without durable authority', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-rule-')); roots.push(root);
    const proposal = proposeRules(root, 'feedback', 'Use strict checks');
    expect(proposal.preview).toContain('Use strict checks');
    expect(proposal.preview).toContain('AGENTS.md');
    expect(fs.existsSync(path.join(root, 'AGENTS.md'))).toBe(false);
  });

  it('retains distinct consecutive feedback while keeping an exact repeated proposal unchanged', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-rule-')); roots.push(root);
    const file = path.join(root, 'AGENTS.md');
    const first = proposeRules(root, 'feedback', 'Keep source files small');
    fs.writeFileSync(file, first.after);
    const second = proposeRules(root, 'feedback', 'Keep tests focused');
    expect(second.write).toBe('append');
    expect(second.after).toContain('Keep source files small');
    expect(second.preview).toContain('Keep tests focused');
    fs.writeFileSync(file, second.after);
    expect(proposeRules(root, 'feedback', 'Keep tests focused').write).toBe('unchanged');
  });

  it('prepares an existing file through the ordinary patch owner with the expected digest', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-rule-')); roots.push(root);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Keep source files small.\n', 'utf8');
    const proposal = proposeRules(root, 'init');
    const prepared = prepareRuleProposal(proposal, { workspaceRoot: root, artifactRoot: root, sessionId: 's1', assertFileAccess: () => {} } as never);
    expect(prepared.preparation.preview).toContain('AGENTS.md');
  });

  it('rejects a stale rule file before preparing the write', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-rule-')); roots.push(root);
    fs.writeFileSync(path.join(root, 'AGENTS.md'), 'Keep source files small.\nKeep tests focused.\n', 'utf8');
    const proposal = proposeRules(root, 'init');
    fs.appendFileSync(path.join(root, 'AGENTS.md'), 'Changed while preview was open.\n', 'utf8');
    expect(() => prepareRuleProposal(proposal, { workspaceRoot: root, artifactRoot: root, sessionId: 's1', assertFileAccess: () => {} } as never)).toThrow(/FILE_CONTENT_CHANGED|Patch source snapshots/);
  });
});
