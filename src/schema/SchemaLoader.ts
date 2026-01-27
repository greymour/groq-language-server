import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { SanitySchema, SchemaType, ResolvedType, ResolvedField } from './SchemaTypes';
import { isDocumentType, isReferenceField, isArrayField, getReferenceTargets, getArrayItemTypes } from './SchemaTypes';

export interface SchemaValidationConfig {
  enabled?: boolean;
  maxDepth?: number;
  maxTypes?: number;
  maxFieldsPerType?: number;
  cacheValidation?: boolean;
}

const DEFAULT_VALIDATION_CONFIG: Required<SchemaValidationConfig> = {
  enabled: true,
  maxDepth: 50,
  maxTypes: 10000,
  maxFieldsPerType: 1000,
  cacheValidation: true,
};

const CACHE_VERSION = 1;

interface SchemaValidationResult {
  valid: boolean;
  error?: string;
}

interface ValidationCacheEntry {
  version: number;
  schemaHash: string;
  configHash: string;
  valid: boolean;
  error?: string;
}

interface GroqTypeSchema {
  name: string;
  type: string;
  attributes?: Record<string, GroqAttribute>;
  value?: {
    type: string;
    attributes?: Record<string, GroqAttribute>;
  };
}

interface GroqAttribute {
  type: string;
  value: GroqAttributeValue;
  optional?: boolean;
}

interface GroqAttributeValue {
  type: string;
  name?: string;
  of?: GroqAttributeValue;
  to?: Array<{ type: string }>;
}

export class SchemaLoader {
  private schema: SanitySchema | null = null;
  private rawSchema: unknown = null;
  private resolvedTypes: Map<string, ResolvedType> = new Map();
  private schemaPath: string | null = null;
  private validationConfig: Required<SchemaValidationConfig>;
  private lastValidationError: string | null = null;

  constructor(validationConfig?: SchemaValidationConfig) {
    this.validationConfig = { ...DEFAULT_VALIDATION_CONFIG, ...validationConfig };
  }

  updateValidationConfig(config: SchemaValidationConfig): void {
    this.validationConfig = { ...this.validationConfig, ...config };
  }

  getValidationConfig(): Required<SchemaValidationConfig> {
    return { ...this.validationConfig };
  }

  getLastValidationError(): string | null {
    return this.lastValidationError;
  }

  async loadFromPath(schemaPath: string): Promise<boolean> {
    try {
      this.lastValidationError = null;
      const absolutePath = path.resolve(schemaPath);
      if (!fs.existsSync(absolutePath)) {
        return false;
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      const parsed = JSON.parse(content);

      if (this.validationConfig.enabled) {
        const schemaHash = this.computeHash(content);
        const configHash = this.computeConfigHash();
        const cachePath = this.getCachePath(absolutePath);

        const cachedResult = this.validationConfig.cacheValidation
          ? this.readValidationCache(cachePath, schemaHash, configHash)
          : null;

        if (cachedResult) {
          if (!cachedResult.valid) {
            const errorMsg = cachedResult.error ?? 'Schema validation failed';
            this.lastValidationError = `${errorMsg} (cached)`;
            this.schema = null;
            this.rawSchema = null;
            this.resolvedTypes.clear();
            return false;
          }
        } else {
          const validation = this.validateSchema(parsed);

          if (this.validationConfig.cacheValidation) {
            this.writeValidationCache(cachePath, schemaHash, configHash, validation);
          }

          if (!validation.valid) {
            this.lastValidationError = validation.error ?? 'Schema validation failed';
            this.schema = null;
            this.rawSchema = null;
            this.resolvedTypes.clear();
            return false;
          }
        }
      }

      this.rawSchema = parsed;
      this.schemaPath = absolutePath;
      this.resolveTypesFromRaw(parsed);

      return true;
    } catch {
      this.schema = null;
      this.rawSchema = null;
      this.resolvedTypes.clear();
      return false;
    }
  }

  private computeHash(content: string): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private computeConfigHash(): string {
    const configString = JSON.stringify({
      maxDepth: this.validationConfig.maxDepth,
      maxTypes: this.validationConfig.maxTypes,
      maxFieldsPerType: this.validationConfig.maxFieldsPerType,
    });
    return crypto.createHash('sha256').update(configString).digest('hex');
  }

  private getCachePath(schemaPath: string): string {
    const schemaPathHash = crypto.createHash('sha256').update(schemaPath).digest('hex').slice(0, 16);
    const cacheDir = path.join(__dirname, '..', '.cache');

    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    return path.join(cacheDir, `${schemaPathHash}.groq-cache`);
  }

  private readValidationCache(
    cachePath: string,
    schemaHash: string,
    configHash: string
  ): SchemaValidationResult | null {
    try {
      if (!fs.existsSync(cachePath)) {
        return null;
      }

      const cacheContent = fs.readFileSync(cachePath, 'utf-8');
      const cache = JSON.parse(cacheContent) as ValidationCacheEntry;

      if (
        cache.version === CACHE_VERSION &&
        cache.schemaHash === schemaHash &&
        cache.configHash === configHash
      ) {
        return { valid: cache.valid, error: cache.error };
      }

      return null;
    } catch {
      return null;
    }
  }

  private writeValidationCache(
    cachePath: string,
    schemaHash: string,
    configHash: string,
    result: SchemaValidationResult
  ): void {
    try {
      const cache: ValidationCacheEntry = {
        version: CACHE_VERSION,
        schemaHash,
        configHash,
        valid: result.valid,
        error: result.error,
      };
      fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');
    } catch {
      // Silently fail - caching is an optimization, not critical
    }
  }

  clearValidationCache(schemaPath?: string): void {
    try {
      const targetPath = schemaPath ?? this.schemaPath;
      if (!targetPath) return;

      const cachePath = this.getCachePath(path.resolve(targetPath));
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    } catch {
      // Silently fail
    }
  }

  loadFromObject(schema: SanitySchema): void {
    this.schema = schema;
    this.schemaPath = null;
    this.resolveTypes();
  }

  private resolveTypesFromRaw(raw: unknown): void {
    this.resolvedTypes.clear();

    if (this.isGroqTypeSchema(raw)) {
      this.resolveGroqTypeSchema(raw);
    } else if (this.isSanitySchema(raw)) {
      this.schema = raw;
      this.resolveTypes();
    }
  }

  private isGroqTypeSchema(raw: unknown): raw is GroqTypeSchema[] | Record<string, GroqTypeSchema> {
    if (Array.isArray(raw) && raw.length > 0) {
      const first = raw[0];
      return typeof first === 'object' && first !== null && 'name' in first &&
             ('attributes' in first || ('value' in first && typeof first.value === 'object'));
    }
    if (typeof raw === 'object' && raw !== null && !('types' in raw)) {
      const values = Object.values(raw);
      if (values.length > 0) {
        const first = values[0] as Record<string, unknown>;
        return typeof first === 'object' && first !== null && 'name' in first;
      }
    }
    return false;
  }

  private isSanitySchema(raw: unknown): raw is SanitySchema {
    return typeof raw === 'object' && raw !== null && 'types' in raw && Array.isArray((raw as SanitySchema).types);
  }

  private resolveGroqTypeSchema(raw: GroqTypeSchema[] | Record<string, GroqTypeSchema>): void {
    const types = Array.isArray(raw) ? raw : Object.values(raw);

    for (const schemaType of types) {
      const resolved = this.resolveGroqType(schemaType);
      if (resolved) {
        this.resolvedTypes.set(schemaType.name, resolved);
      }
    }
  }

  private resolveGroqType(schemaType: GroqTypeSchema): ResolvedType | null {
    const fields = new Map<string, ResolvedField>();
    const isDocument = schemaType.type === 'document';

    const attributes = schemaType.attributes || schemaType.value?.attributes;
    if (attributes) {
      for (const [fieldName, attr] of Object.entries(attributes)) {
        if (attr.type !== 'objectAttribute') continue;

        const resolvedField = this.resolveGroqAttribute(fieldName, attr);
        fields.set(fieldName, resolvedField);
      }
    }

    return {
      name: schemaType.name,
      fields,
      isDocument,
    };
  }

  private resolveGroqAttribute(name: string, attr: GroqAttribute): ResolvedField {
    const value = attr.value;
    let type = value.type;
    let isReference = false;
    let referenceTargets: string[] | undefined;
    let isArray = false;
    let arrayOf: string[] | undefined;

    if (value.type === 'reference' && value.to) {
      isReference = true;
      referenceTargets = value.to.map(t => t.type);
      type = 'reference';
    } else if (value.type === 'array' && value.of) {
      isArray = true;
      if (value.of.type === 'inline' && value.of.name) {
        arrayOf = [value.of.name];
      } else if (value.of.type === 'object') {
        const ofObj = value.of as unknown as { rest?: { name?: string } };
        if (ofObj.rest?.name) {
          arrayOf = [ofObj.rest.name];
        } else {
          arrayOf = [value.of.type];
        }
      } else {
        arrayOf = [value.of.type];
      }
      type = 'array';
    } else if (value.type === 'inline' && value.name) {
      type = value.name;
    }

    return {
      name,
      type,
      isReference,
      referenceTargets,
      isArray,
      arrayOf,
    };
  }

  private resolveTypes(): void {
    this.resolvedTypes.clear();

    if (!this.schema) return;

    for (const schemaType of this.schema.types) {
      const resolved = this.resolveType(schemaType);
      this.resolvedTypes.set(schemaType.name, resolved);
    }
  }

  private resolveType(schemaType: SchemaType): ResolvedType {
    const fields = new Map<string, ResolvedField>();

    if (schemaType.fields) {
      for (const field of schemaType.fields) {
        const resolvedField: ResolvedField = {
          name: field.name,
          type: field.type,
          isReference: isReferenceField(field),
          referenceTargets: isReferenceField(field) ? getReferenceTargets(field) : undefined,
          isArray: isArrayField(field),
          arrayOf: isArrayField(field) ? getArrayItemTypes(field) : undefined,
          description: field.description,
        };
        fields.set(field.name, resolvedField);
      }
    }

    if (isDocumentType(schemaType)) {
      fields.set('_id', { name: '_id', type: 'string', isReference: false, isArray: false });
      fields.set('_type', { name: '_type', type: 'string', isReference: false, isArray: false });
      fields.set('_createdAt', { name: '_createdAt', type: 'datetime', isReference: false, isArray: false });
      fields.set('_updatedAt', { name: '_updatedAt', type: 'datetime', isReference: false, isArray: false });
      fields.set('_rev', { name: '_rev', type: 'string', isReference: false, isArray: false });
    }

    return {
      name: schemaType.name,
      fields,
      isDocument: isDocumentType(schemaType),
    };
  }

  private validateSchema(parsed: unknown): SchemaValidationResult {
    const depthResult = this.checkDepth(parsed, 0);
    if (!depthResult.valid) {
      return depthResult;
    }

    const structureResult = this.validateStructure(parsed);
    if (!structureResult.valid) {
      return structureResult;
    }

    return { valid: true };
  }

  private checkDepth(value: unknown, currentDepth: number): SchemaValidationResult {
    if (currentDepth > this.validationConfig.maxDepth) {
      return {
        valid: false,
        error: `Schema exceeds maximum nesting depth of ${this.validationConfig.maxDepth}`,
      };
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const result = this.checkDepth(item, currentDepth + 1);
        if (!result.valid) return result;
      }
    } else if (value !== null && typeof value === 'object') {
      for (const key of Object.keys(value)) {
        const result = this.checkDepth((value as Record<string, unknown>)[key], currentDepth + 1);
        if (!result.valid) return result;
      }
    }

    return { valid: true };
  }

  private validateStructure(parsed: unknown): SchemaValidationResult {
    if (this.isGroqTypeSchema(parsed)) {
      return this.validateGroqTypeSchemaStructure(parsed);
    } else if (this.isSanitySchema(parsed)) {
      return this.validateSanitySchemaStructure(parsed);
    }

    return {
      valid: false,
      error: 'Schema does not match expected Sanity or GROQ type schema format',
    };
  }

  private validateGroqTypeSchemaStructure(
    raw: GroqTypeSchema[] | Record<string, GroqTypeSchema>
  ): SchemaValidationResult {
    const types = Array.isArray(raw) ? raw : Object.values(raw);

    if (types.length > this.validationConfig.maxTypes) {
      return {
        valid: false,
        error: `Schema contains ${types.length} types, exceeding maximum of ${this.validationConfig.maxTypes}`,
      };
    }

    for (const schemaType of types) {
      if (typeof schemaType.name !== 'string' || schemaType.name.length === 0) {
        return { valid: false, error: 'Schema type missing required "name" field' };
      }
      if (typeof schemaType.type !== 'string') {
        return { valid: false, error: `Schema type "${schemaType.name}" missing required "type" field` };
      }

      const attributes = schemaType.attributes || schemaType.value?.attributes;
      if (attributes) {
        const fieldCount = Object.keys(attributes).length;
        if (fieldCount > this.validationConfig.maxFieldsPerType) {
          return {
            valid: false,
            error: `Type "${schemaType.name}" has ${fieldCount} fields, exceeding maximum of ${this.validationConfig.maxFieldsPerType}`,
          };
        }
      }
    }

    return { valid: true };
  }

  private validateSanitySchemaStructure(schema: SanitySchema): SchemaValidationResult {
    if (!Array.isArray(schema.types)) {
      return { valid: false, error: 'Sanity schema "types" must be an array' };
    }

    if (schema.types.length > this.validationConfig.maxTypes) {
      return {
        valid: false,
        error: `Schema contains ${schema.types.length} types, exceeding maximum of ${this.validationConfig.maxTypes}`,
      };
    }

    for (const schemaType of schema.types) {
      if (typeof schemaType.name !== 'string' || schemaType.name.length === 0) {
        return { valid: false, error: 'Schema type missing required "name" field' };
      }
      if (typeof schemaType.type !== 'string') {
        return { valid: false, error: `Schema type "${schemaType.name}" missing required "type" field` };
      }

      if (schemaType.fields) {
        if (!Array.isArray(schemaType.fields)) {
          return { valid: false, error: `Type "${schemaType.name}" has invalid "fields" (must be an array)` };
        }
        if (schemaType.fields.length > this.validationConfig.maxFieldsPerType) {
          return {
            valid: false,
            error: `Type "${schemaType.name}" has ${schemaType.fields.length} fields, exceeding maximum of ${this.validationConfig.maxFieldsPerType}`,
          };
        }

        for (const field of schemaType.fields) {
          if (typeof field.name !== 'string' || field.name.length === 0) {
            return { valid: false, error: `Field in type "${schemaType.name}" missing required "name"` };
          }
          if (typeof field.type !== 'string') {
            return { valid: false, error: `Field "${field.name}" in type "${schemaType.name}" missing required "type"` };
          }
        }
      }
    }

    return { valid: true };
  }

  getType(typeName: string): ResolvedType | undefined {
    return this.resolvedTypes.get(typeName);
  }

  getDocumentTypes(): ResolvedType[] {
    return Array.from(this.resolvedTypes.values()).filter((t) => t.isDocument);
  }

  getAllTypes(): ResolvedType[] {
    return Array.from(this.resolvedTypes.values());
  }

  getTypeNames(): string[] {
    return Array.from(this.resolvedTypes.keys());
  }

  getDocumentTypeNames(): string[] {
    return this.getDocumentTypes().map((t) => t.name);
  }

  getFieldsForType(typeName: string): ResolvedField[] {
    const type = this.resolvedTypes.get(typeName);
    if (!type) return [];
    return Array.from(type.fields.values());
  }

  getField(typeName: string, fieldName: string): ResolvedField | undefined {
    const type = this.resolvedTypes.get(typeName);
    if (!type) return undefined;
    return type.fields.get(fieldName);
  }

  isLoaded(): boolean {
    return this.schema !== null || this.rawSchema !== null;
  }

  getSchemaPath(): string | null {
    return this.schemaPath;
  }

  clear(): void {
    this.schema = null;
    this.rawSchema = null;
    this.resolvedTypes.clear();
    this.schemaPath = null;
    this.lastValidationError = null;
  }
}

let sharedSchemaLoader: SchemaLoader | null = null;

export function getSharedSchemaLoader(): SchemaLoader {
  if (!sharedSchemaLoader) {
    sharedSchemaLoader = new SchemaLoader();
  }
  return sharedSchemaLoader;
}
