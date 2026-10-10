import { sameValue } from '../../config/values.js';
import { evaluationDigest } from '../../eval/workflow/assets.js';
import type { ToolDefinition } from '../../tools/types.js';
import type { EvaluationRound } from '../../eval/workflow/model.js';
import { report } from '../jobs/projection.js';
import { evaluationProjection } from './projection.js';
import type { EvaluationOwner } from './owner.js';

export function evaluationCheck(owner: EvaluationOwner, requestedKind?: EvaluationRound['kind']): ToolDefinition {
  return { name: 'improve_check', description: 'Approve a frozen isolated evaluation. Failed, incomplete or training-only improvements cannot publish.',
    argsSchema: { type: 'object', properties: {}, additionalProperties: false }, resultAdmission: owner.admission,
    prepare: () => {
      const kind = requestedKind ?? (owner.row.rounds.length ? 'candidate' : 'baseline');
      const expected = owner.row; const section = kind === 'baseline' ? 'baseline' : 'candidate';
      if (owner.admission() || owner.running) throw new Error('No idle live evaluation authority.');
      const digest = evaluationDigest(expected, section);
      return { targets: [], permissionToolName: 'bash', permissionArgs: { command: `${expected.frozen.executable.path} ${expected.frozen.spec.candidateEntry}; ${expected.frozen.executable.path} ${expected.frozen.spec.entry}` },
        previewKind: 'execution', preview: report({ evaluationId: expected.id, kind, executable: expected.frozen.executable.path,
          entry: expected.frozen.spec.entry, candidateEntry: expected.frozen.spec.candidateEntry, digest,
          samples: expected.frozen.spec.samples.length, repetitions: expected.frozen.spec.repetitions,
          isolation: 'Separate read-only candidate and evaluator processes; hidden expected outcomes; no network; fresh process namespaces; 60-second round deadline.',
          publication: 'Evaluation approval does not authorize publishing source files.' }),
        execute: async context => {
          if (!sameValue(expected, owner.row) || evaluationDigest(owner.row, section) !== digest) throw new Error('Prepared evaluation changed after approval.');
          const round = await owner.evaluate(kind, context);
          return { success: true, output: report(evaluationProjection(owner.host, owner.row)), metadata: { status: 'measured', verdict: round.verdict,
            evaluationId: owner.row.id, roundId: round.id } };
        } };
    }, execute: async () => ({ success: false, error: 'Prepared evaluator approval required.' }) };
}
export function evaluationTools(owner: EvaluationOwner): ToolDefinition[] {
  return [evaluationCheck(owner),
    { name: 'improve_patch', description: 'Approve an exact patch to declared isolated candidate files; evaluator and samples remain fixed.',
      argsSchema: { type: 'object', properties: { patch: { type: 'string', minLength: 1, maxLength: 1048576 } }, required: ['patch'], additionalProperties: false },
      resultAdmission: owner.admission, prepare: (args, context) => owner.preparePatch(String(args.patch), context),
      execute: async () => ({ success: false, error: 'Prepared candidate edit approval required.' }) },
    { name: 'improve_status', description: 'Inspect measured improvement and training inputs. Publication still requires /improve publish and independent approval.',
      resultAdmission: owner.admission,
      mcpAnnotations: { readOnlyHint: true }, argsSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: async () => owner.admission() ? { success: false, error: 'No live evaluation authority.' }
        : { success: true, output: report({ ...evaluationProjection(owner.host, owner.row),
          training: owner.row.frozen.spec.samples.filter(sample => sample.split === 'train') }) } }];
}
