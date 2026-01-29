import type { Diagnostic } from 'vscode-languageserver';
import { DiagnosticSeverity } from 'vscode-languageserver';
import type { ParseResult, SyntaxNode } from '../parser/ASTTypes';
import { nodeToRange } from '../parser/ASTTypes';
import { toLSPRange } from '../utils/Range';
import { walkTree, findAncestorOfType, getFieldNode } from '../parser/nodeUtils';
import type { SchemaLoader } from '../schema/SchemaLoader';
import { getAvailableFields } from '../schema/TypeInference';
import { resolveTypeContext } from '../schema/TypeContextResolver';
import { FunctionRegistry } from '../schema/FunctionRegistry';
import type { ExtensionRegistry } from '../extensions/index';

const PRIMITIVE_TYPES = new Set([
  'string',
  'number',
  'boolean',
  'text',
  'datetime',
  'date',
  'url',
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
  extensionRegistry?: ExtensionRegistry;
}

export function getDiagnostics(
  parseResult: ParseResult,
  options: DiagnosticsOptions = {}
): Diagnostic[] {
  const { schemaLoader, source, extensionRegistry } = options;

  const functionRegistry = new FunctionRegistry();
  functionRegistry.extractFromAST(parseResult.tree.rootNode, schemaLoader, source, extensionRegistry);

  const validators: Array<() => Diagnostic[]> = [
    () => collectSyntaxErrors(parseResult),
    () => validateNoRecursion(parseResult.tree.rootNode, functionRegistry),
    () => validateSingleParameter(parseResult.tree.rootNode),
    () => validateSingleParameterUsage(parseResult.tree.rootNode),
    () => validateNoParentScope(parseResult.tree.rootNode),
  ];

  if (schemaLoader?.isLoaded() && source) {
    validators.push(
      () => collectExtensionDiagnostics(extensionRegistry, functionRegistry, schemaLoader, source),
      () => validateFieldReferences(parseResult.tree.rootNode, schemaLoader, functionRegistry),
      () => validatePrimitiveProjections(parseResult.tree.rootNode, schemaLoader, functionRegistry),
    );
  }

  return validators.flatMap(validate => validate());
}

function collectSyntaxErrors(parseResult: ParseResult): Diagnostic[] {
  return parseResult.errors.map(error => ({
    severity: DiagnosticSeverity.Error,
    range: toLSPRange(error.range),
    message: error.message,
    source: 'groq',
  }));
}

function collectExtensionDiagnostics(
  extensionRegistry: ExtensionRegistry | undefined,
  functionRegistry: FunctionRegistry,
  schemaLoader: SchemaLoader,
  source: string
): Diagnostic[] {
  if (!extensionRegistry) return [];

  const hooks = extensionRegistry.getHook('getDiagnostics');
  return hooks.flatMap(({ hook }) =>
    hook({
      functionDefinitions: functionRegistry.getAllDefinitions(),
      schemaLoader,
      source,
    })
  );
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

    // Skip namespaced identifiers (custom function calls like custom::getLinkTitles)
    if (parent?.type === 'namespaced_identifier') return;

    // Only validate identifiers inside projections
    const projection = findAncestorOfType(node, ['projection']);
    if (!projection) return;

    const context = resolveTypeContext(node, { schemaLoader, functionRegistry });
    if (!context?.type) return;

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

    const context = resolveTypeContext(parentProjection, { schemaLoader, functionRegistry });
    if (!context?.type) return;

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

function validateSingleParameter(root: SyntaxNode): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  walkTree(root, (node) => {
    if (node.type !== 'function_definition') return;

    const paramListNode = node.children.find(c => c.type === 'parameter_list');
    if (!paramListNode) return;

    const params = paramListNode.children.filter(c => c.type === 'variable');
    if (params.length > 1) {
      const nameNode = getFieldNode(node, 'name');
      diagnostics.push({
        severity: DiagnosticSeverity.Error,
        range: toLSPRange(nodeToRange(paramListNode)),
        message: `GROQ functions can only have one parameter. Function "${nameNode?.text ?? 'unknown'}" has ${params.length} parameters.`,
        source: 'groq',
      });
    }
  });

  return diagnostics;
}

function validateSingleParameterUsage(root: SyntaxNode): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  walkTree(root, (node) => {
    if (node.type !== 'function_definition') return;

    const nameNode = getFieldNode(node, 'name');
    const paramListNode = node.children.find(c => c.type === 'parameter_list');
    const bodyNode = getFieldNode(node, 'body');

    if (!paramListNode || !bodyNode) return;

    const params = paramListNode.children.filter(c => c.type === 'variable');

    for (const param of params) {
      const paramName = param.text;
      const usages: SyntaxNode[] = [];

      walkTree(bodyNode, (bodyChild) => {
        if (bodyChild.type === 'variable' && bodyChild.text === paramName) {
          usages.push(bodyChild);
        }
      });

      if (usages.length > 1) {
        for (const usage of usages.slice(1)) {
          diagnostics.push({
            severity: DiagnosticSeverity.Error,
            range: toLSPRange(nodeToRange(usage)),
            message: `Parameter "${paramName}" can only be used once in function "${nameNode?.text ?? 'unknown'}".`,
            source: 'groq',
          });
        }
      }
    }
  });

  return diagnostics;
}

function validateNoParentScope(root: SyntaxNode): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];

  walkTree(root, (node) => {
    if (node.type !== 'function_definition') return;

    const nameNode = getFieldNode(node, 'name');
    const bodyNode = getFieldNode(node, 'body');

    if (!bodyNode) return;

    walkTree(bodyNode, (bodyChild) => {
      if (bodyChild.type === 'parent') {
        diagnostics.push({
          severity: DiagnosticSeverity.Error,
          range: toLSPRange(nodeToRange(bodyChild)),
          message: `Parent scope operator "^" cannot be used in function "${nameNode?.text ?? 'unknown'}".`,
          source: 'groq',
        });
      }
    });
  });

  return diagnostics;
}

