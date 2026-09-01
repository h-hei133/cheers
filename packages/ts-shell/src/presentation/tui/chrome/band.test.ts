import { describe, expect, it } from "vitest";
import { contextUsage, renderBand } from "./band.js";
import { visibleWidth } from "../text/measure.js";

const state = { model: "opus-5", branch: "main", directory: "~/project" };

describe("status band", () => {
  it("fills exactly the terminal width", () => {
    for (const width of [20, 40, 80, 120]) {
      expect(visibleWidth(renderBand(state, width))).toBe(width);
    }
  });

  it("stays exact when a segment holds wide characters", () => {
    expect(visibleWidth(renderBand({ ...state, directory: "~/项目/子目录" }, 60))).toBe(60);
  });

  it("keeps the model when width forces segments out", () => {
    // The model decides what answers, so it is the last fact worth dropping.
    expect(renderBand(state, 16)).toContain("opus-5");
  });

  it("omits the context gauge until real usage is recorded", () => {
    expect(renderBand(state, 80)).not.toContain("%");
  });

  it("shows the gauge once usage exists", () => {
    const band = renderBand({ ...state, usedTokens: 18_000, contextWindow: 200_000 }, 80);
    expect(band).toContain("9%");
  });

  it("omits cost until something has been spent", () => {
    expect(renderBand({ ...state, costUsd: 0 }, 80)).not.toContain("$");
    expect(renderBand({ ...state, costUsd: 0.0142 }, 80)).toContain("$0.0142");
  });

  it("shows a non-default agent mode", () => {
    expect(renderBand({ ...state, mode: "plan" }, 80)).toContain("plan");
  });
});

describe("context usage", () => {
  it("is undefined without both a count and a window", () => {
    expect(contextUsage({ model: "m" })).toBeUndefined();
    expect(contextUsage({ model: "m", usedTokens: 10 })).toBeUndefined();
  });

  it("is a rounded percentage, capped at full", () => {
    expect(contextUsage({ model: "m", usedTokens: 5_000, contextWindow: 20_000 })).toBe(25);
    expect(contextUsage({ model: "m", usedTokens: 40_000, contextWindow: 20_000 })).toBe(100);
  });
});
