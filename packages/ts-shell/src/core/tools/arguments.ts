import { Ajv, type ValidateFunction } from 'ajv'
import { Ajv2019 } from 'ajv/dist/2019.js'
import { Ajv2020 } from 'ajv/dist/2020.js'
import formats from 'ajv-formats'

const options = {
  coerceTypes: false, useDefaults: false, removeAdditional: false,
  strictSchema: true, strictTypes: false, strictTuples: false, strictRequired: false,
  ownProperties: true, allErrors: false, logger: false as const,
}
const validators = [new Ajv(options), new Ajv2019(options), new Ajv2020(options)]
for (const validator of validators) {
  const addFormats = formats as unknown as (instance: Ajv) => void
  addFormats(validator)
}
const cache = new WeakMap<object, { source: string; validate: ValidateFunction }>()

/** Validate without coercion, defaults, or including supplied values in errors. */
export function validateToolArguments(schema: Record<string, unknown>, args: unknown): asserts args is Record<string, unknown> {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('Invalid tool arguments: expected an object.')
  }
  let validate: ValidateFunction
  try {
    const source = JSON.stringify(schema)
    const cached = cache.get(schema)
    if (cached?.source === source) {
      validate = cached.validate
    } else {
      const dialect = schema.$schema
      const compiler = dialect === 'https://json-schema.org/draft/2020-12/schema' ? validators[2]
        : dialect === 'https://json-schema.org/draft/2019-09/schema' ? validators[1] : validators[0]
      validate = compiler.compile(schema)
      compiler.removeSchema(schema)
      if ('$async' in validate) throw new Error('Asynchronous schemas are unsupported.')
      cache.set(schema, { source, validate })
    }
  } catch {
    throw new Error('Tool argument schema is invalid or unsupported; execution blocked.')
  }
  if (!validate(args)) {
    const keyword = validate.errors?.[0]?.keyword ?? 'schema'
    throw new Error(`Invalid tool arguments: ${keyword} constraint failed.`)
  }
}
