# Contracts Test Suite

Run the protocol contract fixture suite:

```bash
node contracts/tests/run-contract-tests.mjs
```

The suite validates:

- valid fixtures are accepted
- invalid fixtures are rejected with explicit error codes

Evidence files are written to:

- `.sisyphus/evidence/task-1-valid-schema.txt`
- `.sisyphus/evidence/task-1-invalid-schema-error.txt`
