import type { CliInvocation } from '../../options/argv.js';

/** Only unambiguously interactive launches may take stdin before full parsing. */
export function startupEligible(invocation: CliInvocation, tty: boolean): boolean {
  return tty && invocation.prepaint;
}
