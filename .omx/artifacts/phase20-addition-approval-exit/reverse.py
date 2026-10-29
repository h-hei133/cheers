from pathlib import Path
import subprocess, json, hashlib
root = Path.cwd()
file = root / 'packages/ts-shell/src/cli/interactive/interactiveMode.ts'
scratch = root / '.tmp/approval-exit'
scratch.mkdir(parents=True, exist_ok=True)
content = file.read_bytes()
block = """    if (this.preferences.keybindings.actionFor(event.keyId) === 'app.exit'
      && this.state.editor.getText().length === 0) {
      void this.shutdown();
      return;
    }
"""
assert content.decode().count(block) == 1
try:
    file.write_text(content.decode().replace(block, ''))
    result = subprocess.run(['rtk','proxy','env','NODE_OPTIONS=--max-old-space-size=768','node',
        'node_modules/vitest/vitest.mjs','run','src/cli/interactive/interactiveMode.test.ts','--threads=false',
        '-t','empty-draft exit|nonempty draft.*exit key'], cwd=root/'packages/ts-shell',
        text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    (scratch/'reversal.log').write_text(result.stdout)
    assert result.returncode == 1 and '12 failed' in result.stdout and '2 passed' in result.stdout
finally:
    file.write_bytes(content)
    (scratch/'reversal.json').write_text(json.dumps({'exitCode':result.returncode,'failures':12,'controlsPassed':2,
        'restored':file.read_bytes()==content,'sourceSha256':hashlib.sha256(content).hexdigest()},indent=2)+'\n')
print('reversal: 12 exit failures, 2 nonempty controls; source restored')
