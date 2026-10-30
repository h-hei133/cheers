# Turn restore status evidence

Baseline HEAD 189374283093ce678469451da1f70f5185ed00be.

Original real-writer command tests establish two defects: an unverified write is labeled partial by the report while model metadata says unknown, and a fully blocked zero-write batch also says partial.

The original turn owner now derives one status for report and command metadata. Verified complete, unknown, partial, denied and blocked retain distinct meanings. No writer, permission, persistence or file ordering changes.

baseline.log: two failures, five passes.
focused.log/restored.log: three files, 31 tests pass.
reversal.log/json: only original report.ts restored, two failures; exact source bytes restored.
build-gates.log/build.json: static gates, build and independent input identity, 460 compiler inputs / 3550 source inputs.
regular/fullscreen-cli.log and receipts: original Node CLI, loopback HTTP, actual edit operations. Added blocked batch asserts zero restore and absent model notice, then original partial/complete flows prove no regression. Each mode seven completion requests/three readiness requests; normal exit and cooked input flags verified.
pty.mjs/observe.mjs/freshness.mjs: bounded reproducible evidence scripts derived from 20.50. Observer delegates to original methods; no raw terminal transcript or provider body retained.
ci-observation.json: delayed exact-head observations, prior 20.49 failed the same five editor fixtures repaired by 20.51; 20.50 and 20.51 CI still running.

Unknown writing is verified at the actual writer unit boundary by access retirement after rename and before readback. This CLI fixture does not inject that fault. Linux/synthetic provider evidence does not establish independent review, production providers or a non-Linux/desktop matrix. No full suite, executable stress or 20,000-message PTY.
