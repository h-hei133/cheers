import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderBand } from "./band.js";
import {
  DEFAULT_STATUS_ITEMS,
  normalizeStatusItems,
  renderStatusItem,
  STATUS_ITEMS,
  type StatusFacts,
} from "./items.js";
import { visibleWidth } from "../text/measure.js";
import { stripAnsi } from "../text/ansi.js";
import { defaultTheme } from "../../theme/theme.js";
import { getDefaultTheme } from "../../themes/index.js";

// Color assertions run under an explicit capability, independent of NO_COLOR.
const originalColorMode = defaultTheme.colorMode;
beforeEach(() => defaultTheme.apply(getDefaultTheme(), "256"));
afterEach(() => defaultTheme.apply(getDefaultTheme(), originalColorMode));

const facts: StatusFacts = {
  model: "opus-5",
  provider: "openai",
  branch: "main",
  directory: "~/project",
  agentMode: "build",
};

describe("status band", () => {
  it("fills exactly the terminal width", () => {
    for (const width of [20, 40, 80, 120]) {
      expect(visibleWidth(renderBand(facts, DEFAULT_STATUS_ITEMS, width))).toBe(width);
    }
  });

  it("keeps the row background through colored segments and trailing padding", () => {
    const band = renderBand(facts, ["model", "provider", "branch"], 80);
    expect(band.startsWith("\x1b[48;")).toBe(true);
    expect(band.indexOf("\x1b[0m")).toBe(band.length - "\x1b[0m".length);
    expect(band).not.toContain("\x1b[49m");
    expect(visibleWidth(band)).toBe(80);
    expect(stripAnsi(band).endsWith(" ")).toBe(true);
  });

  it("stays exact when a segment holds wide characters", () => {
    const wide = { ...facts, directory: "~/项目/子目录" };
    expect(visibleWidth(renderBand(wide, DEFAULT_STATUS_ITEMS, 60))).toBe(60);
  });

  it("keeps the first configured item when width forces segments out", () => {
    // Segments drop from the right, so the model survives longest.
    expect(stripAnsi(renderBand(facts, DEFAULT_STATUS_ITEMS, 16))).toContain("opus-5");
  });

  it("shows only the items that were configured", () => {
    const band = stripAnsi(renderBand(facts, ["model", "provider"], 80));
    expect(band).toContain("opus-5");
    expect(band).toContain("openai");
    expect(band).not.toContain("main");
  });

  it("never renders as an empty coloured stripe", () => {
    // Every configured item having nothing to say would otherwise read as a bug.
    expect(stripAnsi(renderBand(facts, ["cost"], 40)).trim()).toBe("opus-5");
  });
});

describe("status items", () => {
  it("omits the context gauge until real usage is recorded", () => {
    expect(renderStatusItem("context", facts)).toBeUndefined();
  });

  it("shows the gauge once usage exists", () => {
    const used = { ...facts, contextUsed: 18_000, contextWindow: 200_000 };
    expect(stripAnsi(renderStatusItem("context", used) ?? "")).toBe("18k/200k 9%");
  });

  it("omits cost until something has been spent", () => {
    expect(renderStatusItem("cost", facts)).toBeUndefined();
    expect(stripAnsi(renderStatusItem("cost", { ...facts, costUsd: 0.0142 }) ?? "")).toBe("est $0.0142");
    expect(stripAnsi(renderStatusItem("cost", { ...facts, costUsd: 0.0142, costRates: 'assumed' }) ?? "")).toBe("est $0.0142 assumed rates");
    expect(stripAnsi(renderStatusItem('cost', { ...facts, costUsd: 0, costRates: 'catalog' })!)).toBe('est $0.0000');
  });

  it('distinguishes the same window value by source, keeps unknown usage unknown, and points to warnings', () => {
    const window = { ...facts, contextWindow: 64_000 };
    expect(stripAnsi(renderStatusItem('context', { ...window, contextWindowSource: 'catalog' })!)).toBe('?/64k');
    expect(stripAnsi(renderStatusItem('context', { ...window, contextWindowSource: 'default' })!)).toBe('?/64k assumed');
    expect(stripAnsi(renderStatusItem('context', { ...window, contextWindowSource: 'config' })!)).toBe('?/64k config');
    expect(stripAnsi(renderStatusItem('context', { ...window, contextWindowSource: 'config', contextWarning: 'Over advertised capacity' })!)).toBe('?/64k config ! /context');
  });

  it("always shows the agent mode, because a key toggles it", () => {
    // A toggle whose state is invisible half the time is a toggle nobody trusts.
    expect(stripAnsi(renderStatusItem("agent-mode", facts) ?? "")).toBe("build");
    expect(stripAnsi(renderStatusItem("agent-mode", { ...facts, agentMode: "plan" }) ?? "")).toBe("plan");
  });

  it("shortens the session id to the part /resume needs", () => {
    const withSession = { ...facts, sessionId: "sess_abcdef0123456789" };
    expect(stripAnsi(renderStatusItem("session", withSession) ?? "")).toBe("abcdef01");
  });

  it("singularises nothing it cannot count", () => {
    expect(renderStatusItem("turns", facts)).toBeUndefined();
    expect(stripAnsi(renderStatusItem("turns", { ...facts, turns: 1 }) ?? "")).toBe("1 turn");
    expect(stripAnsi(renderStatusItem("turns", { ...facts, turns: 4 }) ?? "")).toBe("4 turns");
  });

  it("offers every item with a real source", () => {
    for (const item of STATUS_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.describe.length).toBeGreaterThan(0);
    }
  });
});

describe("item normalisation", () => {
  it("falls back to the defaults for an empty or unknown selection", () => {
    expect(normalizeStatusItems(undefined)).toEqual(DEFAULT_STATUS_ITEMS);
    expect(normalizeStatusItems([])).toEqual(DEFAULT_STATUS_ITEMS);
    expect(normalizeStatusItems(["nonsense"])).toEqual(DEFAULT_STATUS_ITEMS);
  });

  it("returns the chosen items in canonical order, not the order ticked", () => {
    expect(normalizeStatusItems(["branch", "model"])).toEqual(["model", "branch"]);
  });

  it("drops ids that name nothing", () => {
    expect(normalizeStatusItems(["model", "nonsense"])).toEqual(["model"]);
  });
});


it("uses separate status roles without changing context risk thresholds or guessing clean Git state", () => {
  expect(renderStatusItem("model", facts)).toBe(defaultTheme.fg("statusLineModel", facts.model));
  expect(renderStatusItem("directory", facts)).toBe(defaultTheme.fg("statusLinePath", facts.directory!));
  expect(renderStatusItem("branch", facts)).toBe(defaultTheme.fg("dim", "main"));
  expect(renderStatusItem("branch", { ...facts, worktreeDirty: false })).toBe(defaultTheme.fg("statusLineGitClean", "main"));
  expect(renderStatusItem("branch", { ...facts, worktreeDirty: true })).toBe(defaultTheme.fg("statusLineGitDirty", "main"));
  for (const [percent, token] of [[49, "statusLineContext"], [50, "accent"], [70, "warning"], [90, "error"]] as const) {
    expect(renderStatusItem("context", { ...facts, contextUsed: percent, contextWindow: 100 }))
      .toBe(defaultTheme.fg(token, `${percent}/100 ${percent}%`));
  }
});
