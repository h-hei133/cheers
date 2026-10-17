export interface ConfigFileOrigin {
  readonly path: string;
  readonly revision: string;
  readonly source: 'project' | 'user';
  readonly position?: number;
  readonly rule?: number;
  readonly scope?: string;
}
export interface ConfigFileRejection extends ConfigFileOrigin { readonly reason: string }
export interface ConfigFileOrigins {
  readonly files?: readonly ConfigFileOrigin[];
  readonly shadowedFiles?: readonly ConfigFileOrigin[];
  readonly rejectedFiles?: readonly ConfigFileRejection[];
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Map(items.map(item => [JSON.stringify(item), item])).values()];
}

export function contributeFiles(...nodes: (ConfigFileOrigins | undefined)[]) {
  const files = unique(nodes.flatMap(node => node?.files ?? []));
  const shadowedFiles = unique(nodes.flatMap(node => node?.shadowedFiles ?? []));
  const rejectedFiles = unique(nodes.flatMap(node => node?.rejectedFiles ?? []));
  return { ...(files.length ? { files } : {}), ...(shadowedFiles.length ? { shadowedFiles } : {}), ...(rejectedFiles.length ? { rejectedFiles } : {}) };
}

export function replaceFiles(previous: ConfigFileOrigins | undefined, next: ConfigFileOrigins) {
  const shadowedFiles = unique([...(previous?.shadowedFiles ?? []), ...(previous?.files ?? []), ...(next.shadowedFiles ?? [])]);
  const rejectedFiles = unique([...(previous?.rejectedFiles ?? []), ...(next.rejectedFiles ?? [])]);
  return { ...(shadowedFiles.length ? { shadowedFiles } : {}), ...(rejectedFiles.length ? { rejectedFiles } : {}) };
}

export function rejectFile(previous: ConfigFileOrigins, reason: string, file?: ConfigFileOrigin) {
  return file ? { rejectedFiles: unique([...(previous.rejectedFiles ?? []), { ...file, reason }]) } : {};
}
