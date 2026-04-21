export const RUNTIME_PROTOCOL_SCHEMA_VERSION = '1.0.0';
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export function validateSchemaVersion(value) {
    if (value === undefined) {
        return [
            {
                code: 'E_SCHEMA_VERSION_REQUIRED',
                message: 'schemaVersion is required',
                path: '/schemaVersion',
            },
        ];
    }
    if (typeof value !== 'string' || !SEMVER_RE.test(value)) {
        return [
            {
                code: 'E_SCHEMA_VERSION_FORMAT',
                message: 'schemaVersion must match major.minor.patch',
                path: '/schemaVersion',
            },
        ];
    }
    return [];
}
