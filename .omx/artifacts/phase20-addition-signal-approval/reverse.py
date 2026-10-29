from pathlib import Path
import hashlib, json, subprocess

root = Path.cwd()
scratch = root / '.tmp/approval-cancel'
scratch.mkdir(parents=True, exist_ok=True)
picker = root / 'packages/ts-shell/src/cli/interactive/picker/approval.ts'
host = root / 'packages/ts-shell/src/cli/interactive/interactiveMode.ts'
original = {path: path.read_bytes() for path in (picker, host)}
cases = [
    ('listener', picker, "    signal?.addEventListener('abort', cancel, { once: true });", '',
     'src/cli/interactive/picker/approvalSelection.test.ts', 'settles cancelled|closing the approval', 4),
    ('binding', host, '      this.options.sessionRuntime.getCurrentRunController()?.signal));', '      undefined));',
     'src/cli/interactive/interactiveMode.test.ts', 'unanswered approval', 2),
    ('late-navigation', picker, 'if (settled) return;', '',
     'src/cli/interactive/picker/approvalSelection.test.ts', 'settles cancelled', 3),
    ('failed-answer', picker, 'else reject(error);', 'else resolve(result);',
     'src/cli/interactive/picker/approvalSelection.test.ts', 'rejects an approval answer', 1),
]
records = []
try:
    for name, path, before, after, test, selected, failures in cases:
        text = original[path].decode()
        assert before in text
        if name == 'late-navigation':
            # Keep the startup guard; reverse only callback retirement.
            start = text.index('    const chooseGroups = () => {')
            end = text.index("    signal?.addEventListener('abort', cancel", start)
            section = text[start:end]
            assert section.count('if (settled) return;') == 2
            changed = text[:start] + section.replace('if (settled) return;', '') + text[end:]
        else:
            assert text.count(before) == 1
            changed = text.replace(before, after)
        path.write_text(changed)
        try:
            result = subprocess.run(['rtk', 'proxy', 'env', 'NODE_OPTIONS=--max-old-space-size=768', 'node',
                'node_modules/vitest/vitest.mjs', 'run', test, '--threads=false', '-t', selected],
                cwd=root / 'packages/ts-shell', text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
            (scratch / (name + '-reversal.log')).write_text(result.stdout)
            records.append({'case': name, 'exitCode': result.returncode, 'expectedFailures': failures})
            assert result.returncode == 1 and f'{failures} failed' in result.stdout, name
        finally:
            path.write_bytes(original[path])
            assert path.read_bytes() == original[path]
finally:
    for path, content in original.items():
        path.write_bytes(content)
    (scratch / 'reversal.json').write_text(json.dumps({'cases': records,
        'restored': all(path.read_bytes() == content for path, content in original.items()),
        'sourceDigests': {str(path.relative_to(root)): hashlib.sha256(content).hexdigest() for path, content in original.items()}}, indent=2) + '\n')
print(json.dumps(records))
