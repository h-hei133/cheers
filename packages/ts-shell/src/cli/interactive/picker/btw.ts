import { reportText } from '../../../core/commands/report/projection.js';
import { neutraliseForDisplay } from '../../../core/text/safety.js';
import { redactReportText } from '../../../core/security/redaction.js';
import type { Transcript } from '../../../presentation/tui/transcript/container.js';
import type { Option } from '../../../presentation/tui/chrome/options.js';
import type { Picker } from '../overlay.js';

/**
 * Retained side questions are command reports already present in the
 * transcript. Reading this view never asks the provider again and never copies
 * a side answer into the main conversation.
 */
export function btwPicker(transcript: Transcript): Picker {
  let blocks: readonly { readonly id: string; readonly report: NonNullable<ReturnType<Transcript['all']>[number]['report']> }[] = [];
  let revision = transcript.revision;
  const isCurrent = (): boolean => transcript.revision === revision;
  const safe = (value: string): string => neutraliseForDisplay(redactReportText(value, 512));
  return {
    isCurrent,
    title: 'Side questions',
    form: 'panel',
    empty: 'No side questions have been retained.',
    async load(): Promise<readonly Option[]> {
      revision = transcript.revision;
      const retained = transcript.copyable()
        .map((block, index) => ({ block, index }))
        .filter(({ block }) => block.kind === 'command' && block.report?.title === 'Side question');
      blocks = retained.map(({ block, index }) => ({
        id: `btw:${index}`,
        report: block.report!,
      }));
      return blocks.slice().reverse().map(({ id, report }) => {
        const question = report.facts.question;
        return {
          id,
          label: typeof question === 'string' ? safe(question) : safe(report.title),
          detail: report.facts.providerRequest === true ? 'Provider request attempted' : 'No provider request was sent',
          note: report.facts.delivered === true ? 'answered'
            : typeof report.facts.failure === 'string' ? `failure: ${safe(report.facts.failure)}` : 'no answer',
        };
      });
    },
    async apply(ids) {
      if (ids.length !== 1 || !ids[0] || !isCurrent()) return undefined;
      const selected = blocks.find(block => block.id === ids[0]);
      return selected ? { report: selected.report, reportRetained: true } : undefined;
    },
    detail: id => {
      const selected = blocks.find(block => block.id === id);
      if (!selected) return [];
      try {
        return reportText(selected.report, 4000).split('\n');
      } catch {
        return ['Report text is unavailable or exceeds the readable limit.'];
      }
    },
  };
}
