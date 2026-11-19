import { registryUrl } from './client.js';
import { sourceUrl } from './sources.js';
import { text } from './validation.js';
import type { ExtensionSource } from '../model.js';

const REPOSITORY_ORIGIN = 'https://github.com';
const ARCHIVE_ORIGIN = 'https://codeload.github.com';

export interface GitRelease {
  readonly repository: string;
  readonly commit: string;
}

export function gitRelease(repository: unknown, commit: unknown): GitRelease {
  const input = text(repository, 256);
  const url = new URL(input);
  const path = /^\/([a-zA-Z0-9][a-zA-Z0-9-]{0,38})\/([a-zA-Z0-9_.-]{1,104})$/.exec(url.pathname);
  const repo = path?.[2]?.replace(/\.git$/i, '');
  if (input !== url.href || url.origin !== REPOSITORY_ORIGIN || url.username || url.password || url.search || url.hash
    || !path || !repo || repo.length > 100 || repo === '.' || repo === '..') {
    throw new Error('Git packages require a credential-free HTTPS repository URL on github.com.');
  }
  if (typeof commit !== 'string' || !/^[a-fA-F0-9]{40}$/.test(commit)) throw new Error('A full Git commit ID is required.');
  return { repository: `${REPOSITORY_ORIGIN}/${path[1]}/${repo}`, commit: commit.toLowerCase() };
}

export function gitSpec(input: string): GitRelease {
  const selected = /^git:([^#]+)(?:#([^#]+))?$/.exec(input);
  if (!selected) throw new Error('Use git:https://github.com/OWNER/REPO#COMMIT with a full commit ID.');
  return gitRelease(selected[1], selected[2]);
}

export function gitArchiveRoot(release: GitRelease): string {
  return `${release.repository.slice(release.repository.lastIndexOf('/') + 1)}-${release.commit}`;
}

export function gitArchiveTarget(release: GitRelease, base = ARCHIVE_ORIGIN): { source: ExtensionSource; url: string } {
  const selected = sourceUrl(text(base, 2048));
  if (selected.href !== `${ARCHIVE_ORIGIN}/` && selected.protocol !== 'http:') throw new Error('Invalid Git archive endpoint.');
  const source = { name: 'git', url: selected.href.replace(/\/$/, '') };
  return { source, url: registryUrl(source, archivePath(release)).href };
}

export function assertGitArchiveUrl(release: GitRelease, input: string): void {
  const url = sourceUrl(input);
  const suffix = `/${archivePath(release)}`;
  const base = `${url.origin}${url.pathname.slice(0, -suffix.length)}`;
  if (!url.pathname.endsWith(suffix) || gitArchiveTarget(release, base).url !== input) {
    throw new Error('Git archive URL differs from the exact approved repository and commit.');
  }
}

function archivePath(release: GitRelease): string {
  return `${release.repository.slice(REPOSITORY_ORIGIN.length + 1)}/tar.gz/${release.commit}`;
}
