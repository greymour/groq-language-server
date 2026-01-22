import type { SyntaxNode } from '../parser/ASTTypes.js';
import { getFieldNode, findAncestorOfType, walkTree } from '../parser/nodeUtils.js';
import type { SchemaLoader } from './SchemaLoader.js';
import type { ResolvedType, ResolvedField } from './SchemaTypes.js';
import type { FunctionRegistry, FunctionDefinition } from './FunctionRegistry.js';

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

  // Check nested projections first (most specific context)
  // Check if we're inside a nested field projection (e.g., `video { }`)
  const nestedFieldType = inferNestedFieldType(node, schemaLoader);
  if (nestedFieldType) {
    context.type = nestedFieldType;
    context.documentTypes = [nestedFieldType.name];
    return finalizeContext(context, node, schemaLoader);
  }

  // Check if we're inside a projection on an array field access (e.g., `fieldName[] { }`)
  const arrayFieldType = inferArrayFieldType(node, schemaLoader);
  if (arrayFieldType) {
    context.type = arrayFieldType;
    context.documentTypes = [arrayFieldType.name];
    context.isArray = true;
    return finalizeContext(context, node, schemaLoader);
  }

  // Fall back to explicit _type filter
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

  return finalizeContext(context, node, schemaLoader);
}

function finalizeContext(
  context: InferredContext,
  node: SyntaxNode,
  schemaLoader: SchemaLoader
): InferredContext {

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

function inferNestedFieldType(
  node: SyntaxNode,
  schemaLoader: SchemaLoader
): ResolvedType | null {
  // Find the projection we're inside - could be the node itself or an ancestor
  let projection: SyntaxNode | null = null;
  if (node.type === 'projection') {
    projection = node;
  } else {
    projection = findAncestorOfType(node, ['projection']);
  }

  if (!projection || !projection.parent) return null;

  // Check if the projection's parent is a projection_expression
  const projExpr = projection.parent;
  if (projExpr.type !== 'projection_expression') return null;

  // Get the base of the projection_expression
  const baseNode = getFieldNode(projExpr, 'base');
  if (!baseNode) return null;

  // If the base is an identifier, it's a simple field projection like `video { }`
  if (baseNode.type === 'identifier') {
    const fieldName = baseNode.text;

    // Get the parent type context by looking at the outer projection
    const parentContext = getParentTypeContext(projExpr, schemaLoader);
    if (!parentContext) return null;

    // Look up the field in the parent type
    const field = schemaLoader.getField(parentContext.name, fieldName);
    if (!field) return null;

    // If it's a reference field, return the reference target type
    if (field.isReference && field.referenceTargets?.length) {
      const targetTypeName = field.referenceTargets[0];
      return schemaLoader.getType(targetTypeName) ?? null;
    }

    // If it's an inline/object field, try to get its type
    if (field.type && field.type !== 'object') {
      return schemaLoader.getType(field.type) ?? null;
    }
  }

  return null;
}

function getParentTypeContext(
  projExpr: SyntaxNode,
  schemaLoader: SchemaLoader
): ResolvedType | null {
  // Walk up to find the parent projection_expression or subscript_expression
  let current: SyntaxNode | null = projExpr.parent;

  while (current) {
    if (current.type === 'projection') {
      const parentProjExpr = current.parent;
      if (parentProjExpr?.type === 'projection_expression') {
        const baseNode = getFieldNode(parentProjExpr, 'base');

        // Handle simple field projection like `video { }`
        if (baseNode?.type === 'identifier') {
          const fieldName = baseNode.text;
          // Recursively get parent context
          const grandparentContext = getParentTypeContext(parentProjExpr, schemaLoader);
          if (grandparentContext) {
            const field = schemaLoader.getField(grandparentContext.name, fieldName);
            if (field) {
              // Reference field - return target type
              if (field.isReference && field.referenceTargets?.length) {
                return schemaLoader.getType(field.referenceTargets[0]) ?? null;
              }
              // Inline/object field - return its type
              if (field.type && field.type !== 'object') {
                return schemaLoader.getType(field.type) ?? null;
              }
            }
          }
          // Fallback: search all types for this field
          for (const typeName of schemaLoader.getTypeNames()) {
            const field = schemaLoader.getField(typeName, fieldName);
            if (field) {
              if (field.isReference && field.referenceTargets?.length) {
                return schemaLoader.getType(field.referenceTargets[0]) ?? null;
              }
              if (field.type && field.type !== 'object') {
                return schemaLoader.getType(field.type) ?? null;
              }
            }
          }
        }

        if (baseNode?.type === 'subscript_expression') {
          // Check for type filter in the subscript
          const indexNode = getFieldNode(baseNode, 'index');
          if (indexNode) {
            const typeComparison = findTypeComparison(indexNode);
            if (typeComparison) {
              const typeName = extractTypeName(typeComparison);
              if (typeName) {
                return schemaLoader.getType(typeName) ?? null;
              }
            }
          }

          // Check if it's an array field access like `fieldName[]`
          const arrayBase = getFieldNode(baseNode, 'base');
          if (arrayBase?.type === 'identifier') {
            const fieldName = arrayBase.text;
            // Recursively get parent context
            const grandparentContext = getParentTypeContext(parentProjExpr, schemaLoader);
            if (grandparentContext) {
              const field = schemaLoader.getField(grandparentContext.name, fieldName);
              if (field?.isArray && field.arrayOf?.length) {
                return schemaLoader.getType(field.arrayOf[0]) ?? null;
              }
            }
            // Fallback: search all types
            for (const typeName of schemaLoader.getTypeNames()) {
              const field = schemaLoader.getField(typeName, fieldName);
              if (field?.isArray && field.arrayOf?.length) {
                return schemaLoader.getType(field.arrayOf[0]) ?? null;
              }
            }
          }
        }
      }
    }

    // Check for type filter at this level
    if (current.type === 'subscript_expression') {
      const indexNode = getFieldNode(current, 'index');
      if (indexNode) {
        const typeComparison = findTypeComparison(indexNode);
        if (typeComparison) {
          const typeName = extractTypeName(typeComparison);
          if (typeName) {
            return schemaLoader.getType(typeName) ?? null;
          }
        }
      }
    }

    current = current.parent;
  }

  return null;
}

function findTypeFilter(node: SyntaxNode): SyntaxNode | null {
  let current: SyntaxNode | null = node;

  while (current) {
    // Direct subscript_expression ancestor
    if (current.type === 'subscript_expression') {
      const indexNode = getFieldNode(current, 'index');
      if (indexNode) {
        const typeComparison = findTypeComparison(indexNode);
        if (typeComparison) {
          return typeComparison;
        }
      }
    }

    // When inside a projection, check the sibling subscript_expression
    if (current.type === 'projection' && current.parent?.type === 'projection_expression') {
      const baseNode = getFieldNode(current.parent, 'base');
      if (baseNode?.type === 'subscript_expression') {
        const indexNode = getFieldNode(baseNode, 'index');
        if (indexNode) {
          const typeComparison = findTypeComparison(indexNode);
          if (typeComparison) {
            return typeComparison;
          }
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

export function inferTypeContextInFunctionBody(
  node: SyntaxNode,
  functionDef: FunctionDefinition,
  functionRegistry: FunctionRegistry,
  schemaLoader: SchemaLoader
): InferredContext {
  const context: InferredContext = {
    type: null,
    field: null,
    isArray: false,
    documentTypes: [],
  };

  const paramVariable = findParameterVariable(node, functionDef);
  if (paramVariable) {
    const inferredTypes = functionRegistry.getInferredParameterType(
      functionDef.name,
      paramVariable.index
    );

    if (inferredTypes.length > 0) {
      const firstType = schemaLoader.getType(inferredTypes[0]);
      if (firstType) {
        context.type = firstType;
        context.documentTypes = inferredTypes;
        return finalizeContextInFunctionBody(context, node, schemaLoader);
      }
    }
  }

  const accessExpr = findAncestorOfType(node, ['access_expression', 'subscript_expression']);
  if (accessExpr) {
    const baseNode = getFieldNode(accessExpr, 'base');
    if (baseNode?.type === 'variable') {
      const paramMatch = findParameterByName(baseNode.text, functionDef);
      if (paramMatch !== null) {
        const inferredTypes = functionRegistry.getInferredParameterType(
          functionDef.name,
          paramMatch
        );

        if (inferredTypes.length > 0) {
          const firstType = schemaLoader.getType(inferredTypes[0]);
          if (firstType) {
            context.type = firstType;
            context.documentTypes = inferredTypes;
            return finalizeContextInFunctionBody(context, node, schemaLoader);
          }
        }
      }
    }
  }

  return inferTypeContext(node, schemaLoader);
}

function findParameterVariable(
  node: SyntaxNode,
  functionDef: FunctionDefinition
): { name: string; index: number } | null {
  if (node.type === 'variable') {
    const paramIndex = findParameterByName(node.text, functionDef);
    if (paramIndex !== null) {
      return { name: node.text, index: paramIndex };
    }
  }

  let current: SyntaxNode | null = node;
  while (current) {
    if (current.type === 'variable') {
      const paramIndex = findParameterByName(current.text, functionDef);
      if (paramIndex !== null) {
        return { name: current.text, index: paramIndex };
      }
    }

    if (current.type === 'subscript_expression' || current.type === 'access_expression') {
      const baseNode = getFieldNode(current, 'base');
      if (baseNode?.type === 'variable') {
        const paramIndex = findParameterByName(baseNode.text, functionDef);
        if (paramIndex !== null) {
          return { name: baseNode.text, index: paramIndex };
        }
      }
    }

    current = current.parent;
  }

  return null;
}

function findParameterByName(name: string, functionDef: FunctionDefinition): number | null {
  for (let i = 0; i < functionDef.parameters.length; i++) {
    if (functionDef.parameters[i].name === name) {
      return i;
    }
  }
  return null;
}

function finalizeContextInFunctionBody(
  context: InferredContext,
  node: SyntaxNode,
  schemaLoader: SchemaLoader
): InferredContext {
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
    if (baseNode?.type === 'variable') {
      context.isArray = true;
    }
  }

  return context;
}
