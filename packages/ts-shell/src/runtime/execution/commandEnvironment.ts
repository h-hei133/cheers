/**
 * The session's identity, handed to the commands it runs.
 *
 * A command the model runs often needs to know what it is running inside: which
 * session, which provider, which model, how much reasoning was asked for. It
 * could be inferred from the system prompt, but that is a guess about prose. The
 * values are set here instead, so `printf '%s/%s\n' "$CHEERS_PROVIDER" "$CHEERS_MODEL"`
 * answers the question directly.
 *
 * Two rules make the answer trustworthy:
 *
 * 1. Inherited values are removed before anything is written. A harness started
 *    from inside another one inherits that one's variables, and a nested command
 *    would otherwise report the parent's session as its own.
 * 2. Absent means absent. A field with no value is not exported as an empty
 *    string, because a caller cannot tell an empty session id from a missing one
 *    and would treat both as "there is a session".
 */

export const SESSION_ENV_KEYS = [
  'CHEERS_SESSION_ID',
  'CHEERS_SESSION_FILE',
  'CHEERS_PROVIDER',
  'CHEERS_MODEL',
  'CHEERS_REASONING_LEVEL',
] as const;

export type SessionEnvKey = (typeof SESSION_ENV_KEYS)[number];

/** What the caller knows about the run. Every field is optional: a subagent may know less. */
export interface SessionEnvFacts {
  readonly sessionId?: string;
  readonly sessionFile?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly reasoningLevel?: string;
}

const FACTS_TO_KEYS: readonly (readonly [keyof SessionEnvFacts, SessionEnvKey])[] = [
  ['sessionId', 'CHEERS_SESSION_ID'],
  ['sessionFile', 'CHEERS_SESSION_FILE'],
  ['provider', 'CHEERS_PROVIDER'],
  ['model', 'CHEERS_MODEL'],
  ['reasoningLevel', 'CHEERS_REASONING_LEVEL'],
];

/**
 * The environment a command should run with, given the process it inherits.
 *
 * Returns a copy: the caller's `process.env` is never mutated, because a value
 * set for one command must not leak into the next.
 */
export function commandEnvironment(
  inherited: NodeJS.ProcessEnv,
  facts: SessionEnvFacts,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...inherited };
  for (const key of SESSION_ENV_KEYS) {
    delete env[key];
  }
  for (const [field, key] of FACTS_TO_KEYS) {
    const value = facts[field];
    if (typeof value === 'string' && value.trim() !== '') {
      env[key] = value;
    }
  }
  return env;
}
