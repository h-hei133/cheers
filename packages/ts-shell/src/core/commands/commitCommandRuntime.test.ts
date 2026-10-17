import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { routeSlashCommand } from "./slashRouter.js";
import { gitCommandContext, gitFixture } from '../../test-utils/git.js';

let root: string;
let fixture: ReturnType<typeof gitFixture>;
const git = (...args: string[]) => fixture.git(args);
beforeEach(() => {
  fixture = gitFixture(true); root = fixture.root;
  for (const key of ['HOME', 'USERPROFILE', 'XDG_CONFIG_HOME', 'GIT_CEILING_DIRECTORIES', 'GIT_CONFIG_NOSYSTEM', 'GIT_CONFIG_GLOBAL']) vi.stubEnv(key, fixture.env[key as keyof typeof fixture.env]!);
  fs.writeFileSync(path.join(root, "new.txt"), "staged evidence\n");
  git("add", "new.txt");
});
afterEach(() => { vi.unstubAllEnvs(); fixture.cleanup(); });

it("preserves commit guidance without staging or committing during prompt construction", async () => {
  const guidance = "  retain 'a  b' and C:\\tmp\\file\n\t--literal\\  ";
  const before = git("ls-files", "--stage");
  const beforeIndex = fs.readFileSync(path.join(root, '.git', 'index'));
  const result = await routeSlashCommand("/commit " + guidance, gitCommandContext(root));
  expect(result).toMatchObject({ kind: "prompt", prompt: expect.stringContaining("User guidance: " + guidance + "\n") });
  expect(git("ls-files", "--stage")).toBe(before);
  expect(fs.readFileSync(path.join(root, '.git', 'index'))).toEqual(beforeIndex);
  expect(git("rev-list", "--all")).toBe("");
  expect(fs.readFileSync(path.join(root, "new.txt"), "utf8")).toBe("staged evidence\n");
});
