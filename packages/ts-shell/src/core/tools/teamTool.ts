import type { ToolDefinition, ToolExecutionResult } from '../../tools/types.js';
import { readOnlyDelegation } from '../subagents/capability.js';
import { runTeam } from '../subagents/team/run.js';
import type { Refutation } from '../subagents/team/convergence.js';
import { approvedResult, deniedResult } from './toolResultLifecycle.js';
import type { SubagentDefinition } from '../subagents/types.js';

/**
 * Ask several agents the same question, then let them try to break each other.
 *
 * A single answer is one hypothesis argued to its conclusion. Two answers that
 * could not see each other can be pointed at one another, and what survives
 * that is worth more than either — which is the whole reason to spend the
 * tokens. The pass is a tool rather than a slash command because everything it
 * needs (the model, the tool gate, the approval scope, the step budget) lives
 * inside a turn; a command would have to rebuild all of it.
 *
 * The reviewers are read-only. A proposal is an argument, not a change to the
 * workspace, and letting a reviewer edit files would let the act of reviewing
 * decide the outcome.
 */

/** How many proposers one pass may run, and why that number. */
const MAX_PROPOSERS = 3;

export function createTeamToolDefinition(): ToolDefinition {
  return {
    name: 'team',
    description:
      'Ask up to three independent agents the same question, have each try to refute the others, and report what survived. '
      + 'Use it when a question has competing explanations worth testing against each other, not for work that has one answer.',
    argsSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: 'The question every proposer answers, identically.' },
        perspectives: {
          type: 'array',
          minItems: 2,
          maxItems: MAX_PROPOSERS,
          description: 'One angle per proposer. They must differ; identical angles produce the same claim twice.',
          items: { type: 'string' },
        },
        context: { type: 'string', description: 'Shared context every proposer receives. Never another proposer\'s answer.' },
      },
      required: ['question', 'perspectives'],
    },
    async execute(args, context): Promise<ToolExecutionResult> {
      const question = typeof args.question === 'string' ? args.question.trim() : '';
      const perspectives = Array.isArray(args.perspectives)
        ? args.perspectives.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        : [];
      if (!question) return deniedResult('Error: team needs a question.');
      if (perspectives.length < 2) return deniedResult('Error: team needs at least two distinct perspectives to compare.');
      if (perspectives.length > MAX_PROPOSERS) return deniedResult(`Error: team runs at most ${MAX_PROPOSERS} proposers.`);
      if (new Set(perspectives.map(value => value.trim())).size !== perspectives.length) {
        return deniedResult('Error: perspectives must differ; identical angles produce the same claim twice.');
      }
      if (!context.runSubagent) return deniedResult('Error: no model is available to this session, so the team was not started.');

      const shared = typeof args.context === 'string' && args.context.trim() ? args.context.trim() : undefined;
      // The name is fixed, not derived from the role: it is what a `task` deny
      // rule matches against, and the role is text the model chose. A name built
      // from it would let a crafted perspective dodge a rule meant to stop
      // delegation, or trip one meant for something else.
      const definition = (role: string): SubagentDefinition => ({
        name: 'team-proposer',
        description: `Competing-hypothesis proposer (${role})`,
        systemPrompt: `You are one of several independent agents answering the same question. Your angle: ${role}. `
          + 'State the single strongest explanation you can defend. Do not survey alternatives; another agent is covering those.',
        source: 'builtin',
      });
      const capability = readOnlyDelegation({ tools: ['read', 'glob', 'grep'], network: false, maxSteps: 12 });

      const run = async (prompt: string, role: string, signal: AbortSignal | undefined): Promise<string> => {
        const result = await context.runSubagent!({
          definition: definition(role), capability, agentMode: 'plan', workspace: context.workspaceRoot,
          prompt, ...(shared ? { context: shared } : {}), signal,
          // No `admission` of our own: the host's runner already carries the
          // session gate, and supplying a predicate that always answers
          // "allowed" would replace that gate with a rubber stamp.
        });
        if (result.failed) throw new Error(result.failure ?? 'the proposer failed');
        return result.text;
      };

      const outcome = await runTeam({
        requests: perspectives.map((perspective, index) => ({
          id: `p${index + 1}`,
          prompt: question,
          perspective: perspective.trim(),
        })),
        signal: context.abortSignal,
        propose: (request, signal) => run(request.prompt, request.perspective, signal),
        review: async ({ reviewerId, proposals, signal }) => {
          // The reviewer sees the other claims and nothing else — not its own,
          // and not a summary of what the pass expects.
          const listed = proposals.map(proposal => `[${proposal.id}] ${proposal.claim}`).join('\n\n');
          const text = await run(
            `Another agent's claims are below. Try to refute them using what you can read. `
            + `For each claim reply exactly one line: "CLAIM <id> <counterevidence|condition-mismatch|insufficient|none-found> <reason>". `
            + `Cite a file path when you used one; a refutation without a source is recorded but cannot refute.\n\n${listed}`,
            `reviewer for ${reviewerId}`, signal);
          return parseRefutations(text, reviewerId, proposals.map(proposal => proposal.id));
        },
      });

      const lines = [
        `Proposed ${outcome.proposals.filter(result => result.status === 'proposed').length} of ${outcome.proposals.length}.`,
        ...outcome.convergence.outcomes.map(entry => `${entry.proposalId}: ${entry.verdict} — ${entry.reason}`),
        ...(outcome.failedReviews.length ? [`Reviews that did not finish: ${outcome.failedReviews.map(review => review.reviewerId).join(', ')}.`] : []),
        `Limitation: ${outcome.limitation}`,
      ];
      return approvedResult(lines.join('\n'), {
        proposals: outcome.proposals.map(result => ({ id: result.id, status: result.status, claim: result.claim ?? null })),
        outcomes: outcome.convergence.outcomes.map(entry => ({ proposalId: entry.proposalId, verdict: entry.verdict })),
        failedReviews: outcome.failedReviews,
      });
    },
  };
}

/**
 * Read a reviewer's findings from its reply.
 *
 * One line per claim, parsed strictly: a line this cannot read produces no
 * finding rather than a guessed one, and a missing claim is left to the
 * convergence rule, which treats silence as "nothing was established" rather
 * than as agreement.
 *
 * Evidence must be stated, not inferred. A path that merely appears inside the
 * reason is prose — a reviewer can write any path it likes — so the format asks
 * for it explicitly after `evidence:` and everything else stays an opinion,
 * which convergence will not let refute.
 */
export function parseRefutations(text: string, reviewerId: string, proposalIds: readonly string[]): readonly Refutation[] {
  const known = new Set(proposalIds);
  const findings: Refutation[] = [];
  const seen = new Set<string>();
  for (const line of text.split('\n')) {
    const match = /^\s*CLAIM\s+(\S+)\s+(counterevidence|condition-mismatch|insufficient|none-found)\s*(.*)$/i.exec(line);
    if (!match) continue;
    const proposalId = match[1]!;
    if (!known.has(proposalId) || seen.has(proposalId)) continue;
    seen.add(proposalId);
    const rest = match[3]!.trim();
    const split = /\bevidence:\s*(.*)$/i.exec(rest);
    const reason = (split ? rest.slice(0, split.index) : rest).trim();
    const evidence = split ? split[1]!.split(/[,\s]+/).filter(Boolean) : [];
    findings.push({ proposalId, reviewerId, kind: match[2]!.toLowerCase() as Refutation['kind'], reason, evidence });
  }
  return findings;
}
