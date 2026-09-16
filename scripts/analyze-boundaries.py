#!/usr/bin/env python3
"""Multi-root reachability: CLI entries + registered scripts + package public API.

Reports, for each file:
  - cliReachable
  - scriptReachable (scripts/** that import packages/ts-shell/src)
  - publicApiReachable (packages/ts-shell/src/index.ts closure)
  - testReferenced (any *.test.ts imports it)
and classifies the complement as SAFE / NEEDS-REVIEW / PROTECTED.
"""
import os
import re
import json
import sys
from collections import defaultdict, deque

REPO = os.path.abspath(os.path.dirname(__file__) + '/..')
SRC = os.path.join(REPO, 'packages/ts-shell/src')
PKG_ROOT = os.path.join(REPO, 'packages/ts-shell')

EXCLUDE_DIRS = {'node_modules', 'dist', '.git'}


def walk_ts(root):
    out = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for name in filenames:
            if name.endswith(('.ts', '.tsx')):
                out.append(os.path.normpath(os.path.join(dirpath, name)))
    return out


def load_graph(files):
    fset = set(files)

    def resolve(src_file, spec):
        if not spec.startswith('.'):
            return None
        base = os.path.normpath(os.path.join(os.path.dirname(src_file), spec))
        candidates = [base + '.ts', base + '.tsx', base + '.js', base,
                      os.path.join(base, 'index.ts'), os.path.join(base, 'index.tsx')]
        if spec.endswith('.js'):
            candidates += [base[:-3] + '.ts', base[:-3] + '.tsx', os.path.join(base[:-3], 'index.ts')]
        for c in candidates:
            if c in fset:
                return c
        return None

    imp = re.compile(r'(?:from\s+|import\s*\(\s*|import\s+)(["\'](\.[^"\']+)["\'])')
    graph = defaultdict(set)
    for f in files:
        try:
            text = open(f, encoding='utf-8').read()
        except OSError:
            continue
        for m in imp.finditer(text):
            t = resolve(f, m.group(2))
            if t:
                graph[f].add(t)
    return graph


def closure(graph, roots):
    seen = set()
    q = deque(roots)
    while q:
        cur = q.popleft()
        if cur in seen:
            continue
        seen.add(cur)
        for nxt in graph.get(cur, ()):
            if nxt not in seen:
                q.append(nxt)
    return seen


def main():
    src_files = walk_ts(SRC)
    prod = [f for f in src_files if not f.endswith('.test.ts')]
    tests = [f for f in src_files if f.endswith('.test.ts')]
    all_files = prod + tests
    graph = load_graph(all_files)

    cli_entries = [f for f in prod if os.path.normpath(os.path.dirname(f)) == os.path.join(SRC, 'entrypoints')]
    cli_reach = closure(graph, cli_entries)

    script_files = []
    scripts_dir = os.path.join(REPO, 'scripts')
    for dirpath, dirnames, filenames in os.walk(scripts_dir):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for name in filenames:
            if name.endswith(('.ts', '.mjs')):
                script_files.append(os.path.normpath(os.path.join(dirpath, name)))
    script_roots = []
    for sf in script_files:
        try:
            text = open(sf, encoding='utf-8').read()
        except OSError:
            continue
        if 'packages/ts-shell/src' in text:
            script_roots.append(sf)
    script_graph = load_graph(all_files + script_files)
    script_reach = closure(script_graph, script_roots) & set(prod)

    index_ts = os.path.join(SRC, 'index.ts')
    public_api = closure(graph, [index_ts]) if os.path.exists(index_ts) else set()

    test_refs = set()
    test_graph = load_graph(tests + prod)
    for t in tests:
        test_refs |= test_graph.get(t, set())

    report = {'cliEntries': len(cli_entries), 'scriptRoots': len(script_roots)}
    rows = {}
    for f in prod:
        rel = os.path.relpath(f, SRC).replace(os.sep, '/')
        rows[rel] = {
            'cli': f in cli_reach,
            'script': f in script_reach,
            'publicApi': f in public_api,
            'testRef': f in test_refs,
        }
    report['rows'] = rows
    report['totals'] = {
        'production': len(prod),
        'cliReachable': sum(1 for r in rows.values() if r['cli']),
        'cliOpaque': sum(1 for r in rows.values() if not r['cli']),
        'scriptOnly': sum(1 for r in rows.values() if not r['cli'] and r['script']),
        'publicApiOnly': sum(1 for r in rows.values() if not r['cli'] and not r['script'] and r['publicApi']),
        'testOnly': sum(1 for r in rows.values() if not r['cli'] and not r['script'] and not r['publicApi'] and r['testRef']),
        'noReference': sum(1 for r in rows.values() if not any(r.values())),
    }
    print(json.dumps(report['totals'], indent=2, ensure_ascii=False))
    with open('/tmp/boundary-report.json', 'w') as fh:
        json.dump(report, fh, ensure_ascii=False)
    if len(sys.argv) > 1 and sys.argv[1] == '--list':
        for k, v in sorted(rows.items()):
            tags = ''.join(t[0].upper() for t in ('cli', 'script', 'publicApi', 'testRef') if v[t]) or '-'
            print(f'{tags:5s} {k}')


main()
