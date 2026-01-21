import type { SyntaxNode } from '../parser/ASTTypes.js';
import { getFieldNode, findAncestorOfType, walkTree } from '../parser/nodeUtils.js';
import type { SchemaLoader } from './SchemaLoader.js';
import type { ResolvedType, ResolvedField } from './SchemaTypes.js';

export interface InferredContext {
  type: ResolvedType | null;
  field: ResolvedField | null;
  isArray: boolean;
  documentTypes: string[];
}

export function inferTypeContextFromText(
  source: string,
  position: { line: number; character: number },
  schemaLoader: SchemaLoader
): InferredContext {
  const context: InferredContext = {
    type: null,
    field: null,
    isArray: false,
    documentTypes: [],
  };

  const textBeforeCursor = getTextBeforeCursor(source, position);

  // Look for array field access pattern: fieldName[]{
  const arrayFieldMatch = textBeforeCursor.match(/(\w+)\[\]\s*\{\s*[^}]*$/);
  if (arrayFieldMatch) {
    const fieldName = arrayFieldMatch[1];
    const itemType = findArrayItemType(fieldName, schemaLoader);
    if (itemType) {
      context.type = itemType;
      context.documentTypes = [itemType.name];
      context.isArray = true;
      return context;
    }
  }

  // Look for _type == "typeName" pattern
  const typeMatch = textBeforeCursor.match(/_type\s*==\s*["'](\w+)["']/);
  if (typeMatch) {
    const typeName = typeMatch[1];
    const type = schemaLoader.getType(typeName);
    if (type) {
      context.type = type;
      context.documentTypes = [typeName];
      return context;
    }
  }

  context.documentTypes = schemaLoader.getDocumentTypeNames();
  return context;
}

function getTextBeforeCursor(source: string, position: { line: number; character: number }): string {
  const lines = source.split('\n');
  let result = '';
  for (let i = 0; i < position.line && i < lines.length; i++) {
    result += lines[i] + '\n';
  }
  if (position.line < lines.length) {
    result += lines[position.line].substring(0, position.character);
  }
  return result;
}

function findArrayItemType(fieldName: string, schemaLoader: SchemaLoader): ResolvedType | null {
  for (const typeName of schemaLoader.getTypeNames()) {
    const field = schemaLoader.getField(typeName, fieldName);
    if (field?.isArray && field.arrayOf?.length) {
      const itemTypeName = field.arrayOf[0];
      const itemType = schemaLoader.getType(itemTypeName);
      if (itemType) {
        return itemType;
      }
    }
  }
  return null;
}

export function inferTypeContext(
  node: SyntaxNode,
  schemaLoader: SchemaLoader
): InferredContext {
  const context: InferredContext = {
    type: null,
    field: null,
    isArray: false,
    documentTypes: [],
  };

  // First, check for explicit _type filter
  const typeFilter = findTypeFilter(node);
  if (typeFilter) {
    const typeName = extractTypeName(typeFilter);
    if (typeName) {
      context.type = schemaLoader.getType(typeName) ?? null;
      context.documentTypes = [typeName];
    }
  }

  // Check if we're inside a projection on an array field access (e.g., `fieldName[] { }`)
  if (!context.type) {
    const arrayFieldType = inferArrayFieldType(node, schemaLoader);
    if (arrayFieldType) {
      context.type = arrayFieldType;
      context.documentTypes = [arrayFieldType.name];
      context.isArray = true;
    }
  }

  if (!context.type) {
    context.documentTypes = schemaLoader.getDocumentTypeNames();
  }

  const accessExpr = findAncestorOfType(node, ['access_expression', 'dereference_expression']);
  if (accessExpr && context.type) {
    const memberNode = getFieldNode(accessExpr, 'member');
    if (memberNode) {
      context.field = schemaLoader.getField(context.type.name, memberNode.text) ?? null;
    }
  }

  const subscriptExpr = findAncestorOfType(node, 'subscript_expression');
  if (subscriptExpr) {
    const baseNode = getFieldNode(subscriptExpr, 'base');
    if (baseNode?.type === 'everything') {
      context.isArray = true;
    }
  }

  return context;
}

function inferArrayFieldType(
  node: SyntaxNode,
  schemaLoader: SchemaLoader
): ResolvedType | null {
  // Look for projection ancestor
  const projection = findAncestorOfType(node, ['projection']);
  if (!projection || !projection.parent) return null;

  // Check if the projection's parent is a projection_expression
  const projExpr = projection.parent;
  if (projExpr.type !== 'projection_expression') return null;

  // In a projection_expression, find the subscript_expression sibling
  let subscriptExpr: SyntaxNode | null = null;
  for (let i = 0; i < projExpr.childCount; i++) {
    const child = projExpr.child(i);
    if (child?.type === 'subscript_expression') {
      subscriptExpr = child;
      break;
    }
  }

  if (!subscriptExpr) return null;

  // Get the base of the subscript (the field name)
  const baseNode = getFieldNode(subscriptExpr, 'base');
  if (!baseNode || baseNode.type !== 'identifier') return null;

  const fieldName = baseNode.text;

  // Now we need to find what type context the field belongs to
  // Look for parent type context (e.g., from a _type filter higher up)
  const parentTypeFilter = findTypeFilter(subscriptExpr);
  let parentTypes: string[] = [];

  if (parentTypeFilter) {
    const typeName = extractTypeName(parentTypeFilter);
    if (typeName) {
      parentTypes = [typeName];
    }
  }

  if (parentTypes.length === 0) {
    // No explicit type filter, search all types for this field
    parentTypes = schemaLoader.getTypeNames();
  }

  // Find the field in parent types and get its array item type
  for (const typeName of parentTypes) {
    const field = schemaLoader.getField(typeName, fieldName);
    if (field?.isArray && field.arrayOf?.length) {
      // Get the first array item type
      const itemTypeName = field.arrayOf[0];
      const itemType = schemaLoader.getType(itemTypeName);
      if (itemType) {
        return itemType;
      }
    }
  }

  return null;
}

function findTypeFilter(node: SyntaxNode): SyntaxNode | null {
  let current: SyntaxNode | null = node;

  while (current) {
    if (current.type === 'subscript_expression') {
      const indexNode = getFieldNode(current, 'index');
      if (indexNode) {
        const typeComparison = findTypeComparison(indexNode);
        if (typeComparison) {
          return typeComparison;
        }
      }
    }
    current = current.parent;
  }

  return null;
}

function findTypeComparison(node: SyntaxNode): SyntaxNode | null {
  if (isTypeComparison(node)) {
    return node;
  }

  let result: SyntaxNode | null = null;
  walkTree(node, (child) => {
    if (isTypeComparison(child)) {
      result = child;
      return false;
    }
    return undefined;
  });

  return result;
}

function isTypeComparison(node: SyntaxNode): boolean {
  if (node.type !== 'comparison_expression') {
    return false;
  }

  const leftNode = getFieldNode(node, 'left');
  const operatorNode = getFieldNode(node, 'operator');

  if (leftNode?.type !== 'identifier' || leftNode.text !== '_type') {
    return false;
  }

  if (operatorNode?.text !== '==') {
    return false;
  }

  return true;
}

function extractTypeName(comparisonNode: SyntaxNode): string | null {
  const rightNode = getFieldNode(comparisonNode, 'right');

  if (!rightNode) {
    return null;
  }

  if (rightNode.type === 'string') {
    const text = rightNode.text;
    if ((text.startsWith('"') && text.endsWith('"')) ||
        (text.startsWith("'") && text.endsWith("'"))) {
      return text.slice(1, -1);
    }
  }

  return null;
}

export function getAvailableFields(
  context: InferredContext,
  schemaLoader: SchemaLoader
): ResolvedField[] {
  if (context.type) {
    return schemaLoader.getFieldsForType(context.type.name);
  }

  const allFields = new Map<string, ResolvedField>();

  for (const typeName of context.documentTypes) {
    const fields = schemaLoader.getFieldsForType(typeName);
    for (const field of fields) {
      if (!allFields.has(field.name)) {
        allFields.set(field.name, field);
      }
    }
  }

  return Array.from(allFields.values());
}

export function getReferenceTargetFields(
  field: ResolvedField,
  schemaLoader: SchemaLoader
): ResolvedField[] {
  if (!field.isReference || !field.referenceTargets) {
    return [];
  }

  const allFields = new Map<string, ResolvedField>();

  for (const targetType of field.referenceTargets) {
    const fields = schemaLoader.getFieldsForType(targetType);
    for (const f of fields) {
      if (!allFields.has(f.name)) {
        allFields.set(f.name, f);
      }
    }
  }

  return Array.from(allFields.values());
}
