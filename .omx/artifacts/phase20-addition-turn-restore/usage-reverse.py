import hashlib
import json
import pathlib
import subprocess

root = pathlib.Path.cwd()
archive = root / '.omx/artifacts/phase20-addition-turn-restore'
file = 'packages/ts-shell/src/observability/usageTelemetry.ts'
original = (root / file).read_bytes()
report = {'baseline': 'ef4d078d43f2923a02e6d60efe1166ec339633d2', 'restored': False}
try:
    (root / file).write_bytes(subprocess.check_output(['rtk', 'proxy', 'git', 'show', report['baseline'] + ':' + file]))
    with (archive / 'usage-reversal.log').open('wb') as output:
        result = subprocess.run(['rtk', 'proxy', 'env', 'NODE_OPTIONS=--max-old-space-size=768',
            './node_modules/.bin/vitest', 'run', 'src/observability/usage/attribution.test.ts',
            'src/session/store/usage.test.ts', '--threads=false', '-t',
            'persists .* after attributed usage|persists a local restore notice'],
            cwd=root / 'packages/ts-shell', stdout=output, stderr=subprocess.STDOUT, timeout=45)
    report['exitCode'] = result.returncode
    if result.returncode != 1:
        raise RuntimeError('reversal did not produce assertion failures')
finally:
    (root / file).write_bytes(original)
    report['restored'] = (root / file).read_bytes() == original
    report['sourceSha256'] = hashlib.sha256(original).hexdigest()
    (archive / 'usage-reversal.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
