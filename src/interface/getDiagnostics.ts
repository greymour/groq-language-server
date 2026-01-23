import type { Diagnostic } from 'vscode-languageserver';
import { DiagnosticSeverity } from 'vscode-languageserver';
import type { ParseResult, SyntaxNode } from '../parser/ASTTypes.js';
import { nodeToRange } from '../parser/ASTTypes.js';
import { toLSPRange } from '../utils/Range.js';
import { walkTree, findAncestorOfType, getFieldNode } from '../parser/nodeUtils.js';
import type { SchemaLoader } from '../schema/SchemaLoader.js';
import { inferTypeContext, inferTypeContextInFunctionBody, getAvailableFields } from '../schema/TypeInference.js';
import { FunctionRegistry } from '../schema/FunctionRegistry.js';

const PRIMITIVE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'text',
  'datetime',
  'date',
  'url',
  'slug',
  'geopoint',
]);

const BUILT_IN_FIELD_TYPES: Record<string, string> = {
  '_id': 'string',
  '_type': 'string',
  '_rev': 'string',
  '_createdAt': 'datetime',
  '_updatedAt': 'datetime',
  '_key': 'string',
};

function getBuiltInFieldType(fieldName: string): string | undefined {
  return BUILT_IN_FIELD_TYPES[fieldName];
}

export interface DiagnosticsOptions {
  schemaLoader?: SchemaLoader;
  source?: string;
}

export function getDiagnostics(
  parseResult: ParseResult,
  options: DiagnosticsOptions = {}
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  for (const error of parseResult.errors) {
    diagnostics.push({
      severity: DiagnosticSeverity.Error,
      range: toLSPRange(error.range),
      message: error.message,
      source: 'groq',
    });
  }

  // Always check for recursive function calls (doesn't require schema)
  const functionRegistry = new FunctionRegistry();
  functionRegistry.extractFromAST(parseResult.tree.rootNode, options.schemaLoader);

  const recursionErrors = validateNoRecursion(parseResult.tree.rootNode, functionRegistry);
  diagnostics.push(...recursionErrors);

  if (options.schemaLoader?.isLoaded() && options.source) {
    const schemaErrors = validateFieldReferences(
      parseResult.tree.rootNode,
      options.schemaLoader,
      functionRegistry
    );
    diagnostics.push(...schemaErrors);

    const primitiveProjectionErrors = validatePrimitiveProjections(
      parseResult.tree.rootNode,
      options.schemaLoader,
      functionRegistry
    );
    diagnostics.push(...primitiveProjectionErrors);
  }

  return diagnostics;
}

function validateFieldReferences(
  root: SyntaxNode,
  schemaLoader: SchemaLoader,
  functionRegistry: FunctionRegistry
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const checkedNodes = new Set<number>();

  walkTree(root, (node) => {
    if (node.type !== 'identifier') return;
    if (checkedNodes.has(node.id)) return;
    checkedNodes.add(node.id);

    const fieldName = node.text;

    // Skip built-in fields and special identifiers
    if (fieldName.startsWith('_') || fieldName.startsWith('$')) return;

    // Skip if this is a key in a key-value pair (aliased field)
    const parent = node.parent;
    if (parent?.type === 'pair') {
      const keyNode = parent.childForFieldName('key');
      if (keyNode?.id === node.id) return;
    }

    // Skip function names (both built-in and custom)
    if (parent?.type === 'function_call') {
      const funcNode = parent.childForFieldName('function');
      if (funcNode?.id === node.id) return;
      const nameNode = parent.childForFieldName('name');
      if (nameNode?.id === node.id) return;
    }

    // Skip custom function definition names
    if (parent?.type === 'function_definition') {
      const nameNode = parent.childForFieldName('name');
      if (nameNode?.id === node.id) return;
    }

    // Skip namespaced identifiers (custom function calls like brex::legalPageLinkTitles)
    if (parent?.type === 'namespaced_identifier') return;

    // Only validate identifiers inside projections
    const projection = findAncestorOfType(node, ['projection']);
    if (!projection) return;

    // Check if we're inside a function body - use function-aware inference
    const funcDef = functionRegistry.isInsideFunctionBody(node);
    let context;
    if (funcDef) {
      context = inferTypeContextInFunctionBody(node, funcDef, functionRegistry, schemaLoader);
    } else {
      context = inferTypeContext(node, schemaLoader);
    }

    if (!context.type) return;

    // Get available fields for this type
    const availableFields = getAvailableFields(context, schemaLoader);
    const fieldNames = new Set(availableFields.map(f => f.name));

    // Check if the field exists
    if (!fieldNames.has(fieldName)) {
      diagnostics.push({
        severity: DiagnosticSeverity.Warning,
        range: toLSPRange(nodeToRange(node)),
        message: `Field "${fieldName}" does not exist on type "${context.type.name}"`,
        source: 'groq',
      });
    }
  });

  return diagnostics;
}

function validatePrimitiveProjections(
  root: SyntaxNode,
  schemaLoader: SchemaLoader,
  functionRegistry: FunctionRegistry
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const checkedNodes = new Set<number>();

  walkTree(root, (node) => {
    if (node.type !== 'projection_expression') return;
    if (checkedNodes.has(node.id)) return;
    checkedNodes.add(node.id);

    // Get the base of the projection_expression
    const baseNode = getFieldNode(node, 'base');
    if (!baseNode || baseNode.type !== 'identifier') return;

    const fieldName = baseNode.text;

    // Check built-in fields directly - they're all primitives
    if (fieldName.startsWith('_')) {
      const builtInType = getBuiltInFieldType(fieldName);
      if (builtInType && PRIMITIVE_TYPES.has(builtInType)) {
        const projectionNode = getFieldNode(node, 'projection');
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: toLSPRange(nodeToRange(projectionNode ?? node)),
          message: `Cannot project on primitive type "${builtInType}" (field "${fieldName}")`,
          source: 'groq',
        });
      }
      return;
    }

    // Find the parent type context to look up this field
    const parentProjection = findAncestorOfType(node, ['projection']);
    if (!parentProjection) return;

    // Check if we're inside a function body - use function-aware inference
    const funcDef = functionRegistry.isInsideFunctionBody(node);
    let context;
    if (funcDef) {
      context = inferTypeContextInFunctionBody(parentProjection, funcDef, functionRegistry, schemaLoader);
    } else {
      context = inferTypeContext(parentProjection, schemaLoader);
    }

    if (!context.type) return;

    // Look up the field in the parent type
    const field = schemaLoader.getField(context.type.name, fieldName);
    if (!field) return;

    // Check if the field type is primitive
    if (PRIMITIVE_TYPES.has(field.type)) {
      const projectionNode = getFieldNode(node, 'projection');
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: toLSPRange(nodeToRange(projectionNode ?? node)),
        message: `Cannot project on primitive type "${field.type}" (field "${fieldName}")`,
        source: 'groq',
      });
    }
  });

  return diagnostics;
}

function validateNoRecursion(
  root: SyntaxNode,
  functionRegistry: FunctionRegistry
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  walkTree(root, (node) => {
    if (node.type !== 'function_call') return;

    const nameNode = getFieldNode(node, 'name');
    if (!nameNode) return;

    const calledFuncName = nameNode.text;

    // Check if this call is inside a function body
    const containingFunc = functionRegistry.isInsideFunctionBody(node);
    if (!containingFunc) return;

    // Check if calling itself (direct recursion)
    if (containingFunc.name === calledFuncName) {
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: toLSPRange(nodeToRange(nameNode)),
        message: `Recursive function calls are not supported in GROQ`,
        source: 'groq',
      });
    }
  });

  return diagnostics;
}
