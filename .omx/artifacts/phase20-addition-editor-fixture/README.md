# External editor fixture portability

Prior CI 40981106387 for ec8a44aab6884e9f1e496e049f5263fb4e54a7bc failed exactly five externalEditor.test.ts line-ending fixtures; 12,548 tests passed and three were skipped. Gates and build passed. The fixtures invoked rtk as their editor, a development command wrapper not installed by CI.

The corrected fixture calls quoted process.execPath and quoted editor path directly. A space in the fixture directory tests actual command splitting, and empty PATH proves no dependency on rtk or a node command lookup. PATH is restored in finally. Product externalEditor.ts and CI/build configuration are unchanged.

baseline.log: five original command failures under empty PATH.
focused.log: 21 editor tests pass after repair.
reversal.log/json: replacing only the editor command with the original rtk invocation fails all five relevant tests, then exact bytes are restored.
restored.log: all 21 tests pass after restoration.
gates.log: five required local static gates and diff check.

No build or PTY repeated for this test-only change. This local result does not establish a future CI outcome.
