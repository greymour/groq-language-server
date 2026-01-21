import * as fs from 'fs';
import * as path from 'path';
import type { SanitySchema, SchemaType, ResolvedType, ResolvedField } from './SchemaTypes.js';
import { isDocumentType, isReferenceField, isArrayField, getReferenceTargets, getArrayItemTypes } from './SchemaTypes.js';

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

  async loadFromPath(schemaPath: string): Promise<boolean> {
    try {
      const absolutePath = path.resolve(schemaPath);
      if (!fs.existsSync(absolutePath)) {
        return false;
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      const parsed = JSON.parse(content);

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
    this.resolvedTypes.clear();
    this.schemaPath = null;
  }
}

let sharedSchemaLoader: SchemaLoader | null = null;

export function getSharedSchemaLoader(): SchemaLoader {
  if (!sharedSchemaLoader) {
    sharedSchemaLoader = new SchemaLoader();
  }
  return sharedSchemaLoader;
}
