import type { Diagnostic } from 'vscode-languageserver';
import { DiagnosticSeverity } from 'vscode-languageserver';
import type { ParseResult, SyntaxNode } from '../parser/ASTTypes.js';
import { nodeToRange } from '../parser/ASTTypes.js';
import { toLSPRange } from '../utils/Range.js';
import { walkTree, findAncestorOfType } from '../parser/nodeUtils.js';
import type { SchemaLoader } from '../schema/SchemaLoader.js';
import { inferTypeContext, getAvailableFields } from '../schema/TypeInference.js';

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

  if (options.schemaLoader?.isLoaded() && options.source) {
    const schemaErrors = validateFieldReferences(
      parseResult.tree.rootNode,
      options.schemaLoader
    );
    diagnostics.push(...schemaErrors);
  }

  return diagnostics;
}

function validateFieldReferences(
  root: SyntaxNode,
  schemaLoader: SchemaLoader
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

    // Skip function names
    if (parent?.type === 'function_call') {
      const funcNode = parent.childForFieldName('function');
      if (funcNode?.id === node.id) return;
    }

    // Only validate identifiers inside projections
    const projection = findAncestorOfType(node, ['projection']);
    if (!projection) return;

    // Infer the type context for this node
    const context = inferTypeContext(node, schemaLoader);
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
