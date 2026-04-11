# Runtime Protocol Versioning Policy

This document defines semantic versioning and compatibility guarantees for `contracts/runtime-protocol.schema.json` and derived TS/Rust/Python contract definitions.

## Version Format

Every payload MUST include `schemaVersion` and it MUST follow `major.minor.patch`:

- Example: `1.0.0`
- Optional prerelease/build metadata (e.g. `1.2.0-rc.1`) is syntactically accepted, but production cross-runtime traffic SHOULD use stable versions.

## Compatibility Contract

### Major (`X.0.0`) - breaking

Bump MAJOR when any change can break existing consumers/producers:

- Removing fields
- Renaming fields
- Changing field meaning/semantics
- Tightening validation in a way that rejects previously valid payloads
- Changing enum values incompatibly

Expected behavior: mixed major versions are **not compatible**. Validators SHOULD return `E_COMPATIBILITY_UNSUPPORTED`.

### Minor (`x.Y.0`) - backward-compatible additions

Bump MINOR for additive, non-breaking changes:

- Adding optional fields
- Adding new message kinds while keeping existing kinds unchanged
- Adding enum values only if consumers are explicitly specified to ignore unknown values (otherwise this is major)
- Adding non-mandatory metadata

Expected behavior: newer minor payloads SHOULD be accepted by older consumers if unknown optional fields are ignored.

### Patch (`x.y.Z`) - non-structural fixes

Bump PATCH for clarifications and fixes that do not change wire shape:

- Documentation clarifications
- Corrected descriptions/examples
- Tooling/validator implementation bug fixes with no schema structure change

Expected behavior: full compatibility.

## Required Validation Outcomes

Validators MUST reject malformed payloads with explicit protocol codes:

- Missing `schemaVersion` → `E_SCHEMA_VERSION_REQUIRED`
- Malformed `schemaVersion` (not semver) → `E_SCHEMA_VERSION_FORMAT`
- Unknown or unsupported payload kind → `E_KIND_INVALID`
- Missing required field (other than schemaVersion) → `E_FIELD_REQUIRED`
- Wrong field type → `E_FIELD_INVALID_TYPE`
- Invalid enum/range/pattern value → `E_FIELD_INVALID_VALUE`

Domain-specific codes may be used when helpful:

- `E_COMMAND_INVALID`
- `E_TASK_STATUS_INVALID`
- `E_PERMISSION_RESPONSE_INVALID`
- `E_CANCELLATION_INVALID`

## Compatibility Matrix (Producer → Consumer)

| Producer Version | Consumer Version | Result |
| --- | --- | --- |
| same major, same minor, same patch | exact match | Accept |
| same major, producer minor >= consumer minor | tolerant consumer | Accept (if additive changes only) |
| same major, producer minor < consumer minor | newer consumer | Accept |
| same major, patch differs | either direction | Accept |
| different major | any | Reject with `E_COMPATIBILITY_UNSUPPORTED` |

## Upgrade Guidance

1. Update schema first.
2. Regenerate/update TS/Rust/Python definitions.
3. Add fixtures for new valid/invalid cases.
4. Keep at least one compatibility test per supported minor line.
