import { describe, expect, it } from "vitest";
import { SESSION_ENV_KEYS, commandEnvironment } from "./commandEnvironment.js";

/**
 * What a command learns about the session it runs in.
 *
 * Two properties are the whole point: a nested harness must not report its
 * parent's session, and a fact nobody knows must be absent rather than empty.
 */
describe("commandEnvironment", () => {
  it("writes the facts it was given", () => {
    const env = commandEnvironment({}, { sessionId: "sess_1", model: "m-1", provider: "openai" });
    expect(env.CHEERS_SESSION_ID).toBe("sess_1");
    expect(env.CHEERS_MODEL).toBe("m-1");
    expect(env.CHEERS_PROVIDER).toBe("openai");
  });

  it("drops inherited session values before writing its own", () => {
    // A harness started from inside another one inherits that one's variables.
    // Without this, a nested command reports the parent's session as its own.
    const inherited = {
      CHEERS_SESSION_ID: "parent-session",
      CHEERS_MODEL: "parent-model",
      PATH: "/usr/bin",
    };
    const env = commandEnvironment(inherited, { sessionId: "child-session" });

    expect(env.CHEERS_SESSION_ID).toBe("child-session");
    expect(env.CHEERS_MODEL).toBeUndefined();
    // Everything else is inherited untouched.
    expect(env.PATH).toBe("/usr/bin");
  });

  it("omits a fact it does not have rather than exporting it empty", () => {
    // An empty session id reads as "there is a session" to a caller that cannot
    // tell the two apart.
    const env = commandEnvironment({ CHEERS_SESSION_FILE: "parent.jsonl" }, { sessionId: "s" });
    expect(env.CHEERS_SESSION_FILE).toBeUndefined();
    expect("CHEERS_SESSION_FILE" in env).toBe(false);
  });

  it("treats a blank value as absent", () => {
    const env = commandEnvironment({}, { model: "   ", provider: "openai" });
    expect(env.CHEERS_MODEL).toBeUndefined();
    expect(env.CHEERS_PROVIDER).toBe("openai");
  });

  it("does not mutate the environment it was handed", () => {
    const inherited: NodeJS.ProcessEnv = { CHEERS_SESSION_ID: "parent" };
    commandEnvironment(inherited, { sessionId: "child" });
    expect(inherited.CHEERS_SESSION_ID).toBe("parent");
  });

  it("never leaves an inherited value for a key it manages", () => {
    const inherited: NodeJS.ProcessEnv = {};
    for (const key of SESSION_ENV_KEYS) inherited[key] = "stale";
    const env = commandEnvironment(inherited, {});
    for (const key of SESSION_ENV_KEYS) expect(env[key]).toBeUndefined();
  });
});
