import { compileValidator } from './compiler.js';
import type { JsonSchemaValidator, jsonSchemaValidator } from '@modelcontextprotocol/sdk/validation/types.js';

/** MCP output contracts accept extension annotations as inert metadata. */
export class SchemaValidatorProvider implements jsonSchemaValidator {
  getValidator<T>(schema: unknown): JsonSchemaValidator<T> {
    const validate = compileValidator<T>(schema, { allowExtensionAnnotations: true });
    return input => validate(input) ? { valid: true, data: input as T, errorMessage: undefined }
      : { valid: false, data: undefined, errorMessage: 'Structured content did not match its declared schema.' };
  }
}
