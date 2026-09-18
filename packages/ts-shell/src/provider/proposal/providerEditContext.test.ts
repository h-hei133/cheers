import { describe, expect, it } from "vitest";
import { buildProviderEditContextPacket } from "./providerEditContext.js";

describe("providerEditContext", () => {
  it("builds a redacted budgeted context packet", () => {
    const packet = buildProviderEditContextPacket({
      targets: [
        {
          path: "src/app.ts",
          excerpt:
            "const token = 'sk-1234567890abcdef'; // /home/wang/.private-agents-real/config",
          exactMappingFact: "explicit-old-new",
        },
      ],
      userConstraints: ["do not reveal api_key=secret-value"],
      maxExcerptCharsPerTarget: 40,
    });

    expect(packet.status).toBe("ready");
    expect(packet.targetScope).toBe("explicit-target");
    expect(packet.redactionStatus).toBe("redacted-and-budgeted");
    expect(packet.targets[0]?.excerptSummary).toContain("[redacted]");
    expect(JSON.stringify(packet)).not.toContain("secret-value");
    expect(JSON.stringify(packet)).not.toContain(".private-agents-real/config");
    expect(packet.omittedContentReasons).toContain("excerpt-over-budget-truncated");
    expect(packet.evidence).toContain("provider-edit-context:raw-full-content-excluded");
  });

  it("stops missing and over-budget context before provider use", () => {
    expect(buildProviderEditContextPacket({}).status).toBe("missing-target");
    expect(
      buildProviderEditContextPacket({
        targets: [{ path: "a.ts" }, { path: "b.ts" }],
        maxTargets: 1,
      }).status,
    ).toBe("over-budget");
  });
});
