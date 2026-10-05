import { expect, it } from "vitest";
import { modelArgumentCompletions } from "./completion.js";
import { parseModelArgs } from "./syntax.js";

const values = (prefix: string) => modelArgumentCompletions(prefix)?.map(item => item.value) ?? [];
it("projects actions and aliases from the executable syntax", () => {
  expect(values("")).toEqual(expect.arrayContaining(["status", "refresh", "config", "list", "use", "help"]));
  expect(values("se")).toContain("set");
  expect(values("ls")).toContain("ls");
  expect(parseModelArgs(["--help"]).ok).toBe(true);
});
it.each(["status ", "help ", "config ", "refresh ", "use first extra ", "use --unknown "])("does not offer models after %s", prefix => {
  expect(values(prefix)).toEqual([]);
});
it("offers model pairs at direct and explicit positions, preserving provider list semantics", () => {
  expect(values("use openai/").length).toBeGreaterThan(0);
  expect(values("openai/")).toEqual(values("use openai/"));
  expect(values("SET openai/")).toEqual(values("use openai/"));
  expect(values("list open")).toContain("openai");
  expect(values("list open").every(value => !value.includes("/"))).toBe(true);
  expect(values("use chosen --g")).toEqual(["--global"]);
  expect(values("chosen --g")).toEqual(["--global"]);
  expect(values("use chosen --global ")).toEqual([]);
});
