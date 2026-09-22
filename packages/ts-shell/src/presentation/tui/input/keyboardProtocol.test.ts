import { describe, expect, it } from "vitest";
import { KeyboardNegotiation } from "./keyboardProtocol.js";

describe("negotiation", () => {
  it("asks for the enhanced protocol and a device attributes sentinel", () => {
    // The sentinel is what makes the fallback decidable by reply rather than by
    // a guessed timeout: every terminal answers it.
    const negotiation = new KeyboardNegotiation();
    expect(negotiation.query).toBe("\x1b[?u\x1b[c");
    expect(negotiation.pending).toBe(true);
  });

  it("enables the enhanced protocol when the terminal replies", () => {
    const negotiation = new KeyboardNegotiation(false);
    const step = negotiation.consume("\x1b[?0u");
    expect(step.write).toBe("\x1b[>5u");
    expect(step.forward).toBe("");
    expect(negotiation.active).toBe("enhanced");
    expect(negotiation.restore).toBe("\x1b[<u");
  });

  it("uses the reduced level where alternate-key reporting breaks shift", () => {
    const negotiation = new KeyboardNegotiation(true);
    expect(negotiation.consume("\x1b[?0u").write).toBe("\x1b[>1u");
  });

  it("falls back to modifyOtherKeys when only the sentinel answers", () => {
    const negotiation = new KeyboardNegotiation();
    const step = negotiation.consume("\x1b[?62;c");
    expect(step.write).toBe("\x1b[>4;2m");
    expect(negotiation.active).toBe("modify-other-keys");
    expect(negotiation.restore).toBe("\x1b[>4;0m");
  });

  it("prefers the enhanced reply when both arrive in one chunk", () => {
    const negotiation = new KeyboardNegotiation(false);
    const step = negotiation.consume("\x1b[?0u\x1b[?62;c");
    expect(step.write).toBe("\x1b[>5u");
    expect(negotiation.active).toBe("enhanced");
  });

  it("stops inspecting input once settled", () => {
    const negotiation = new KeyboardNegotiation();
    negotiation.consume("\x1b[?0u");
    expect(negotiation.pending).toBe(false);
    expect(negotiation.consume("\x1b[?0u").forward).toBe("\x1b[?0u");
  });
});

describe("input passthrough during negotiation", () => {
  it("never swallows keystrokes typed before the reply", () => {
    const negotiation = new KeyboardNegotiation();
    expect(negotiation.consume("hello").forward).toBe("hello");
  });

  it("forwards the keys around a reply", () => {
    const negotiation = new KeyboardNegotiation(false);
    const step = negotiation.consume("a\x1b[?0ub");
    expect(step.forward).toBe("ab");
  });

  it("forwards ordinary escape sequences untouched", () => {
    const negotiation = new KeyboardNegotiation();
    expect(negotiation.consume("\x1b[A").forward).toBe("\x1b[A");
    expect(negotiation.pending).toBe(true);
  });

  it("never holds a bare escape or a bare CSI", () => {
    // A terminal that answers neither query leaves negotiation pending forever;
    // holding these would swallow Escape and the arrow keys outright.
    const negotiation = new KeyboardNegotiation();
    expect(negotiation.consume("\x1b").forward).toBe("\x1b");
    expect(negotiation.consume("\x1b[").forward).toBe("\x1b[");
  });

  it("gives up when no reply arrives, releasing anything held", () => {
    const negotiation = new KeyboardNegotiation();
    negotiation.consume("\x1b[?");
    expect(negotiation.expire()).toBe("\x1b[?");
    expect(negotiation.pending).toBe(false);
    expect(negotiation.active).toBe("legacy");
    expect(negotiation.restore).toBe("");
  });

  it("expiring after a reply changes nothing", () => {
    const negotiation = new KeyboardNegotiation(false);
    negotiation.consume("\x1b[?0u");
    expect(negotiation.expire()).toBe("");
    expect(negotiation.active).toBe("enhanced");
  });

  it("holds a reply split across chunks instead of leaking its bytes", () => {
    const negotiation = new KeyboardNegotiation(false);
    expect(negotiation.consume("\x1b[?").forward).toBe("");
    const step = negotiation.consume("0u");
    expect(step.write).toBe("\x1b[>5u");
    expect(step.forward).toBe("");
  });

  it("releases a held prefix that never became a reply", () => {
    const negotiation = new KeyboardNegotiation();
    negotiation.consume("\x1b[?");
    expect(negotiation.flush()).toBe("\x1b[?");
  });

  it("reports legacy when nothing ever replied", () => {
    const negotiation = new KeyboardNegotiation();
    expect(negotiation.active).toBe("legacy");
    expect(negotiation.restore).toBe("");
  });
});
