import path from 'node:path';
import { isRecord } from '../../values/record.js';

export interface McpStdioLaunch {
  readonly command: string;
  readonly args: readonly string[];
}

export interface McpExtensionApproval {
  readonly packageId: string;
  readonly digest: string;
  readonly workspace: string;
}

function absolutePath(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 4096 && !/[\x00-\x1f\x7f]/.test(value)
    && path.isAbsolute(value) && path.resolve(value) === value;
}

export function mcpStdioLaunch(command: unknown, args: unknown): McpStdioLaunch {
  if (!absolutePath(command) || !Array.isArray(args) || args.length > 32
    || args.some(arg => typeof arg !== 'string' || arg.length > 1024 || arg.includes('\0'))
    || Buffer.byteLength(JSON.stringify([command, ...args])) > 8192) {
    throw new Error('Extension MCP requires an absolute command and at most 32 explicit arguments.');
  }
  return Object.freeze({ command, args: Object.freeze([...args]) });
}

export function mcpExtensionApproval(value: unknown): McpExtensionApproval {
  if (!isRecord(value) || Object.keys(value).length !== 3 || typeof value.packageId !== 'string'
    || !/^[a-z][a-z0-9_-]{0,63}$/.test(value.packageId) || typeof value.digest !== 'string'
    || !/^[a-f0-9]{64}$/.test(value.digest) || !absolutePath(value.workspace)) {
    throw new Error('Extension MCP approval requires a package ID, exact digest and absolute workspace.');
  }
  return Object.freeze({ packageId: value.packageId, digest: value.digest, workspace: value.workspace });
}
