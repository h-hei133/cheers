import hashlib
import json
import pathlib
import subprocess

root = pathlib.Path.cwd()
baseline = 'ec8a44aab6884e9f1e496e049f5263fb4e54a7bc'
archive = root / '.omx/artifacts/phase20-addition-background-wait'
package = root / 'packages/ts-shell'
files = ['packages/ts-shell/src/core/tools/shell/background.ts',
         'packages/ts-shell/src/core/tools/discovery/state.ts']
original = {name: (root / name).read_bytes() for name in files}
report = {'restored': False, 'cases': []}
try:
    for name, test, selection in [
        (files[0], 'src/core/tools/backgroundTools.test.ts', 'waiting for a background command'),
        (files[1], 'src/core/tools/discovery/state.test.ts', 'offers the background wait advertised'),
    ]:
        before = subprocess.check_output(['rtk', 'proxy', 'git', 'show', baseline + ':' + name])
        (root / name).write_bytes(before)
        label = 'wait' if name == files[0] else 'discovery'
        with (archive / ('reversal-' + label + '.log')).open('wb') as output:
            result = subprocess.run(['rtk', 'proxy', 'env', 'NODE_OPTIONS=--max-old-space-size=768',
                './node_modules/.bin/vitest', 'run', test, '--threads=false', '-t', selection],
                cwd=package, stdout=output, stderr=subprocess.STDOUT, timeout=45)
        (root / name).write_bytes(original[name])
        report['cases'].append({'owner': name, 'exitCode': result.returncode,
            'oldDigest': hashlib.sha256(before).hexdigest(), 'restoredDigest': hashlib.sha256(original[name]).hexdigest()})
        if result.returncode != 1:
            raise RuntimeError('reversal did not produce expected assertion failures')
finally:
    for name, content in original.items():
        (root / name).write_bytes(content)
    report['restored'] = all((root / name).read_bytes() == content for name, content in original.items())
    (archive / 'reversal.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report))
