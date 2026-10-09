import type { ToolDefinition } from '../../tools/types.js';

const readOnly = new WeakMap<ToolDefinition, { readonly network: boolean; readonly delegation: boolean }>();

/** Native composition declares this property; tool arguments cannot grant it. */
export function readOnlyTool(tool: ToolDefinition, options: { readonly network?: boolean; readonly delegation?: boolean } = {}): ToolDefinition {
  readOnly.set(tool, { network: options.network === true, delegation: options.delegation === true });
  return tool;
}

export function nativeReadOnly(tool?: ToolDefinition): boolean {
  return tool !== undefined && readOnly.has(tool);
}

export function readOnlyAccess(tool: ToolDefinition): { readonly network: boolean; readonly delegation: boolean } | undefined {
  return readOnly.get(tool);
}
