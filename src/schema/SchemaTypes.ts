export interface SanitySchema {
  types: SchemaType[];
}

export interface SchemaType {
  name: string;
  type: string;
  title?: string;
  description?: string;
  fields?: SchemaField[];
}

export interface SchemaField {
  name: string;
  type: string;
  title?: string;
  description?: string;
  of?: SchemaFieldOf[];
  to?: SchemaReference[];
  options?: Record<string, unknown>;
}

export interface SchemaFieldOf {
  type: string;
  name?: string;
  fields?: SchemaField[];
}

export interface SchemaReference {
  type: string;
}

export interface ResolvedType {
  name: string;
  fields: Map<string, ResolvedField>;
  isDocument: boolean;
}

export interface ResolvedField {
  name: string;
  type: string;
  isReference: boolean;
  referenceTargets?: string[];
  isArray: boolean;
  arrayOf?: string[];
  description?: string;
}

export function isDocumentType(schemaType: SchemaType): boolean {
  return schemaType.type === 'document';
}

export function isObjectType(schemaType: SchemaType): boolean {
  return schemaType.type === 'object';
}

export function getFieldType(field: SchemaField): string {
  return field.type;
}

export function isReferenceField(field: SchemaField): boolean {
  return field.type === 'reference';
}

export function isArrayField(field: SchemaField): boolean {
  return field.type === 'array';
}

export function getReferenceTargets(field: SchemaField): string[] {
  if (!field.to) return [];
  return field.to.map((ref) => ref.type);
}

export function getArrayItemTypes(field: SchemaField): string[] {
  if (!field.of) return [];
  return field.of.map((item) => item.type);
}
