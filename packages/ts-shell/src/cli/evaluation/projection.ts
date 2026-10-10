import type { Evaluation } from '../../eval/workflow/model.js';
import { summarizeMeasurements } from '../../eval/workflow/scoring.js';
import { liveEvaluations } from './owner.js';
import type { JobsComposition } from '../jobs/model.js';

export function evaluationProjection(host: JobsComposition, row: Evaluation) {
  const live = liveEvaluations.get(host.context);
  return { id: row.id, phase: row.phase === 'active' && (live?.row.id !== row.id || live.admission()) ? 'unknown' : row.phase,
    storedPhase: row.phase, completionProof: false, publicationProof: row.phase === 'published', candidate: row.directory ? `${row.directory.path}/candidate` : null,
    target: row.frozen.spec.target, guardrails: row.frozen.spec.guardrails,
    samples: { train: row.frozen.spec.samples.filter(sample => sample.split === 'train').length,
      holdout: row.frozen.spec.samples.filter(sample => sample.split === 'holdout').length },
    roundsRemaining: row.frozen.spec.maxRounds - row.rounds.length, operationId: row.operationId,
    rounds: row.rounds.map(round => ({ id: round.id, kind: round.kind,
      status: round.status === 'running' && (live?.row.id !== row.id || !live.running) ? 'unknown' : round.status,
      digest: round.digest, verdict: round.verdict, metrics: summarizeMeasurements(row.frozen.spec, round.measurements) })) };
}
