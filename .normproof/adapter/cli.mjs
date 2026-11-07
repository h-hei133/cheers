import fs from 'node:fs';
import path from 'node:path';
import { contract, repository } from './artifact.mjs';
import { runShadow } from './shadow.mjs';

const [command, target, destination, extra] = process.argv.slice(2);
if (command !== 'shadow' || extra) {
  console.error('Usage: node .normproof/adapter/cli.mjs shadow [workspace] [output]; blocking is unavailable pending operator decision.');
  process.exitCode = 1;
} else {
  fs.mkdirSync(path.join(repository, '.tmp'), { recursive: true });
  const scratch = fs.mkdtempSync(path.join(repository, '.tmp/adapter-'));
  try {
    const workspace = fs.realpathSync(path.resolve(target ?? repository));
    const relative = path.relative(repository, workspace);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('unsupported_workspace: target must remain in Cheers');
    const output = path.resolve(destination ?? path.join(repository, '.normproof/out/adapter'));
    const outputRoot = path.relative(repository, output);
    if (!outputRoot.startsWith('.tmp' + path.sep) && !outputRoot.startsWith('.normproof/out' + path.sep)) {
      throw new Error('unsupported_output: output must remain in repository scratch or ignored judge output');
    }
    const result = runShadow(workspace, output, scratch);
    fs.writeFileSync(path.join(output, 'shadow.json'), JSON.stringify(result, null, 2) + '\n');
    console.log(JSON.stringify({ ...result, process: undefined }));
  } catch (error) {
    console.log(JSON.stringify({ contract: { name: contract.name, version: contract.version }, mode: 'shadow', canBlock: false,
      hostExitCode: 0, observation: 'unsupported', reasonCode: error.message.split(':', 1)[0], proofVerdict: 'not_reported' }));
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}
