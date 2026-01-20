import * as fs from 'fs';
import * as path from 'path';
import type { SanitySchema, SchemaType, ResolvedType, ResolvedField } from './SchemaTypes.js';
import { isDocumentType, isReferenceField, isArrayField, getReferenceTargets, getArrayItemTypes } from './SchemaTypes.js';

export class SchemaLoader {
  private schema: SanitySchema | null = null;
  private resolvedTypes: Map<string, ResolvedType> = new Map();
  private schemaPath: string | null = null;

  async loadFromPath(schemaPath: string): Promise<boolean> {
    try {
      const absolutePath = path.resolve(schemaPath);
      if (!fs.existsSync(absolutePath)) {
        return false;
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      const schema = JSON.parse(content) as SanitySchema;

      this.schema = schema;
      this.schemaPath = absolutePath;
      this.resolveTypes();

      return true;
    } catch {
      this.schema = null;
      this.resolvedTypes.clear();
      return false;
    }
  }

  loadFromObject(schema: SanitySchema): void {
    this.schema = schema;
    this.schemaPath = null;
    this.resolveTypes();
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
    return this.schema !== null;
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
