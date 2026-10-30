import hashlib
import json
import pathlib
import subprocess

root = pathlib.Path.cwd()
archive = root / '.omx/artifacts/phase20-addition-turn-restore'
owners = ['command.ts', 'service.ts', 'turnRestore.ts']
files = ['packages/ts-shell/src/edit/recovery/undo/' + owner for owner in owners]
original = {file: (root / file).read_bytes() for file in files}
report = {'baseline': 'ef4d078d43f2923a02e6d60efe1166ec339633d2', 'restored': False}
try:
    for file in files:
        (root / file).write_bytes(subprocess.check_output(['rtk', 'proxy', 'git', 'show', report['baseline'] + ':' + file]))
    with (archive / 'reversal.log').open('wb') as output:
        result = subprocess.run(['rtk', 'proxy', 'env', 'NODE_OPTIONS=--max-old-space-size=768',
            './node_modules/.bin/vitest', 'run', 'src/edit/recovery/undo/command.test.ts',
            'src/edit/recovery/undo/turnRestore.test.ts', '--threads=false'], cwd=root / 'packages/ts-shell',
            stdout=output, stderr=subprocess.STDOUT, timeout=45)
    report['exitCode'] = result.returncode
    if result.returncode != 1:
        raise RuntimeError('reversal did not produce assertion failures')
finally:
    for file, content in original.items():
        (root / file).write_bytes(content)
    report['restored'] = all((root / file).read_bytes() == content for file, content in original.items())
    report['sourceDigests'] = {file: hashlib.sha256(content).hexdigest() for file, content in original.items()}
    (archive / 'reversal.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
