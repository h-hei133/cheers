import { createReport, span } from '../../core/commands/report/projection.js';
import type { CommandReport, ReportLine, ReportRole } from '../../core/commands/report/contract.js';
import { sanitizePanelText, sidebarPanelTextHasForbiddenContent, type SidebarPanel, type SidebarPanelLine } from './sidebarPanelModel.js';
import type { SidebarLivePanelFrame } from './sidebarLivePanelRuntime.js';

/** Project the already bounded, redacted panel model without clipping physical rows. */
export function sidebarReport(panel: SidebarPanel, frame?: SidebarLivePanelFrame): CommandReport {
  const lines: ReportLine[] = [];
  for (const section of panel.sections) {
    lines.push({ kind: 'heading', spans: [span(section.title, 'heading')] });
    for (const item of section.lines) lines.push({ kind: 'text', bullet: true, spans: [span(item.text, role(item.severity))] });
    lines.push({ kind: 'space' });
  }
  if (panel.warnings.length) {
    lines.push({ kind: 'heading', spans: [span('Panel warnings', 'warning')] });
    for (const warning of panel.warnings) lines.push({ kind: 'text', bullet: true, spans: [span(warning.message, role(warning.severity))] });
  }
  const report = createReport({ title: panel.title, lines,
    facts: { source: 'session-state-snapshot', panelVersion: panel.panelVersion, density: panel.density,
      safety: { ...panel.safety, scope: 'snapshot-calculation', history: 'managed-by-command-host' }, budget: { ...panel.budget },
      sections: panel.sections.map(section => ({ id: section.id, title: section.title, severity: section.severity,
        lines: section.lines.map(item => ({ text: item.text, severity: item.severity,
          sourceId: item.sourceId ? sanitizePanelText(item.sourceId) : null })) })),
      warnings: panel.warnings.map(warning => ({ id: sanitizePanelText(warning.id), message: warning.message, severity: warning.severity })),
      frame: frame ? { number: frame.frameNumber, updatedAt: frame.updatedAt, ...frame.metadata } : null },
  });
  if (sidebarPanelTextHasForbiddenContent(JSON.stringify(report))) throw new Error('Sidebar report rejected forbidden content.');
  return report;
}

function role(severity: SidebarPanelLine['severity']): ReportRole {
  return severity === 'blocked' || severity === 'error' ? 'error' : severity === 'warning' ? 'warning' : severity === 'success' ? 'success' : 'text';
}
