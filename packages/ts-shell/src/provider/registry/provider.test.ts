import { expect, it } from "vitest";
import { classifyProviderFailure } from "./provider.js";

it("classifies provider failures distinctly", () => {
    expect(classifyProviderFailure({ missingConfig: true })).toBe("provider_config");
    expect(classifyProviderFailure({ missingAuth: true })).toBe("provider_auth");
    expect(classifyProviderFailure({ message: "network unreachable" })).toBe("provider_network");
    expect(classifyProviderFailure({ status: 500 })).toBe("provider_endpoint");
    expect(classifyProviderFailure({ message: "ThrottlingException: rate exceeded" })).toBe("provider_rate_limited");
    expect(classifyProviderFailure({ status: 429 })).toBe("provider_rate_limited");
    expect(classifyProviderFailure({ errorName: "AbortError" })).toBe("provider_timeout");
    expect(classifyProviderFailure({ cancelled: true })).toBe("provider_cancelled");
    expect(classifyProviderFailure({ message: "malformed response schema" })).toBe("provider_response_malformed");
    expect(classifyProviderFailure({ message: "content_filter safety block" })).toBe("provider_safety_block");
    expect(classifyProviderFailure({ streamProtocolError: true })).toBe("provider_stream_protocol_error");
    expect(classifyProviderFailure({ malformedStreamEvent: true })).toBe("provider_stream_event_malformed");
    expect(classifyProviderFailure({ invalidOutput: true })).toBe("provider_output_invalid");
    expect(classifyProviderFailure({ insufficientOutput: true })).toBe("provider_output_insufficient");
    expect(classifyProviderFailure({ redactionFailed: true })).toBe("provider_redaction_failure");
    expect(classifyProviderFailure({ fallbackEligible: true })).toBe("provider_fallback_eligible");
    expect(classifyProviderFailure({ fallbackIneligible: true })).toBe("provider_fallback_ineligible");
    expect(classifyProviderFailure({ routeBug: true })).toBe("provider_route_error");
  });
