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

  const typeFilter = findTypeFilter(node);
  if (typeFilter) {
    const typeName = extractTypeName(typeFilter);
    if (typeName) {
      context.type = schemaLoader.getType(typeName) ?? null;
      context.documentTypes = [typeName];
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
