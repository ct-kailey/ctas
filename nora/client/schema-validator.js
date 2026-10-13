'use strict';

const Ajv2020 = require('ajv/dist/2020').default;

// Compile only the checked-in contracts. Do not coerce, repair, fill, or remove
// input data: unexpected model fields must fail rather than silently disappear.
const ajv = new Ajv2020({
  strict: true,
  validateSchema: true,
  allErrors: true,
  ownProperties: true,
  coerceTypes: false,
  removeAdditional: false,
  useDefaults: false,
  verbose: false,
});

// `version` is a repository schema annotation, not a validation rule. Register
// that one keyword explicitly so every other unknown keyword remains an error.
ajv.addKeyword({ keyword: 'version', schemaType: 'string', valid: true });

const validators = {
  document: ajv.compile(require('../schemas/document.schema.json')),
  request: ajv.compile(require('../schemas/change-review-request.schema.json')),
  result: ajv.compile(require('../schemas/change-review-result.schema.json')),
};

function validate(schemaName, value, code) {
  const validator = validators[schemaName];
  if (validator(value)) return value;

  const error = new Error(`${code}: ${schemaName} does not match its JSON schema`);
  error.name = 'SchemaValidationError';
  error.code = code;
  error.schemaName = schemaName;
  // Ajv replaces its mutable errors property on later calls. Preserve this
  // failure's structured diagnostics without including the supplied payload.
  error.validationErrors = (validator.errors || []).map(issue => ({
    instancePath: issue.instancePath,
    schemaPath: issue.schemaPath,
    keyword: issue.keyword,
    message: issue.message,
    params: structuredClone(issue.params),
  }));
  throw error;
}

// These functions validate structure only. Call review-core's validators too
// for project/revision equality, total text size, provenance, and coverage.
function validateDocumentSchema(value) {
  return validate('document', value, 'DOCUMENT_SCHEMA_INVALID');
}

function validateRequestSchema(value) {
  return validate('request', value, 'REQUEST_SCHEMA_INVALID');
}

function validateResultSchema(value) {
  return validate('result', value, 'RESULT_SCHEMA_INVALID');
}

module.exports = { validateDocumentSchema, validateRequestSchema, validateResultSchema };
