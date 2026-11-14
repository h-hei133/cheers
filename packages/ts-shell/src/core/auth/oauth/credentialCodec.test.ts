import { describe, expect, it } from "vitest";
import { normalizeProviderAccountAuth } from "../../../config/account.js";
import {
  decodeOAuthRecordToAccountAuth,
  encodeAccountAuthToOAuthRecord,
  parseOAuthCredentialRecord,
  summarizeOAuthCredential,
} from "./credentialCodec.js";

describe("OAuth extended schema codec", () => {
  it("parses OAuth credential envelopes while preserving extra fields and blocking prototype pollution", () => {
    const raw = JSON.parse(
      '{"type":"oauth","access":"tok_a","refresh":"tok_r","expires":1999999999999,"enterpriseUrl":"https://ghe.example.com","availableModelIds":["gpt-4.1"],"__proto__":{"polluted":true}}',
    );
    const parsed = parseOAuthCredentialRecord(raw);
    expect(parsed).toEqual({
      type: "oauth",
      access: "tok_a",
      refresh: "tok_r",
      expires: 1999999999999,
      enterpriseUrl: "https://ghe.example.com",
      availableModelIds: ["gpt-4.1"],
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(parseOAuthCredentialRecord({ type: "api_key", access: "a", refresh: "r", expires: 1 })).toBeUndefined();
    expect(parseOAuthCredentialRecord({ type: "oauth", access: "a", refresh: "r", expires: Number.NaN })).toBeUndefined();
  });

  it("round-trips OpenAI, Google, and subscription credentials with extras and secret-free summaries", () => {
    const envelope = {
      type: "oauth" as const,
      access: "access-secret",
      refresh: "refresh-secret",
      expires: 1800000000000,
      enterpriseUrl: "https://corp.ghe.internal",
      region: "eu-west-1",
    };

    const decoded = decodeOAuthRecordToAccountAuth("github-copilot", envelope);
    expect(decoded).toEqual({
      type: "subscription",
      provider: "github-copilot",
      accessToken: "access-secret",
      refreshToken: "refresh-secret",
      expiresAt: 1800000000000,
      extras: {
        enterpriseUrl: "https://corp.ghe.internal",
        region: "eu-west-1",
      },
    });

    const reEncoded = encodeAccountAuthToOAuthRecord(decoded!);
    expect(reEncoded).toMatchObject({
      type: "oauth",
      access: "access-secret",
      refresh: "refresh-secret",
      expires: 1800000000000,
      provider: "github-copilot",
      enterpriseUrl: "https://corp.ghe.internal",
      region: "eu-west-1",
    });

    const summary = summarizeOAuthCredential(decoded!, "github-copilot");
    expect(summary).toEqual({
      type: "oauth",
      providerId: "github-copilot",
      expiresAt: 1800000000000,
      extraKeys: ["enterpriseUrl", "provider", "region"],
    });
    expect(JSON.stringify(summary)).not.toContain("access-secret");
    expect(JSON.stringify(summary)).not.toContain("refresh-secret");
  });

  it("prevents extras from overwriting canonical fields and strips nested unsafe keys", () => {
    const nested = JSON.parse('{"tenant":"prod","deep":{"__proto__":{"evil":1},"ok":true}}');
    const normalized = normalizeProviderAccountAuth("openai", {
      openai: {
        type: "openai-chatgpt-account",
        accessToken: " real-access ",
        refreshToken: " real-refresh ",
        expiresAt: 123456,
        accountId: "acct_1",
        extras: { ...nested, type: "api_key", access: "spoof", expires: 1, accountId: "spoof_acct" },
      },
    });
    expect(normalized?.openai?.extras).toMatchObject({ tenant: "prod", deep: { ok: true } });
    expect(({} as Record<string, unknown>).evil).toBeUndefined();

    const encoded = encodeAccountAuthToOAuthRecord(normalized!.openai!);
    expect(encoded.type).toBe("oauth");
    expect(encoded.access).toBe("real-access");
    expect(encoded.refresh).toBe("real-refresh");
    expect(encoded.expires).toBe(123456);
    expect(encoded.accountId).toBe("acct_1");
  });
});
