import { reportMetadata } from '../report/metadata.js';
import { createReport, span } from '../report/projection.js';
import type { ReportLine } from '../report/contract.js';
import type { McpClientSnapshot } from '../../mcp/types.js';

export function mcpReport(snapshot: McpClientSnapshot, projectRoot: string) {
  const counts = new Map<string, number>();
  for (const tool of snapshot.tools) counts.set(tool.serverName, (counts.get(tool.serverName) ?? 0) + 1);
  const lines: ReportLine[] = [{ kind: 'space' }, { kind: 'heading', spans: [span('MCP servers', 'heading')] }];
  for (const client of snapshot.clients) {
    const name = reportMetadata(client.name, projectRoot);
    const state = client.type === 'connected' ? `${counts.get(client.name) ?? 0} tools`
      : client.type === 'failed' ? reportMetadata(client.error, projectRoot)
      : client.type === 'needs-auth' ? 'authentication required'
      : client.type === 'pending' ? 'connecting…' : 'disabled';
    lines.push({ kind: 'text', spans: [span(name, 'command'), span(`  ${state}`)] });
  }
  return createReport({ title: 'MCP server refresh', lines, facts: {
    servers: snapshot.clients.map(client => ({ name: reportMetadata(client.name, projectRoot), state: client.type,
      tools: client.type === 'connected' ? counts.get(client.name) ?? 0 : null })), toolCount: snapshot.tools.length,
  } });
}
