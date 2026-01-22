import type { CompletionItem, Position } from 'vscode-languageserver';
import type { SyntaxNode } from '../parser/ASTTypes.js';
import { getNodeAtPosition, findAncestorOfType, getFieldNode } from '../parser/nodeUtils.js';
import { getCharacterBeforePosition, getWordAtPosition } from '../utils/positionUtils.js';
import {
  getFunctionCompletions,
  getKeywordCompletions,
  getSpecialCharCompletions,
  getFilterStartCompletions,
  getProjectionCompletions,
  getPipeCompletions,
  getAfterEverythingCompletions,
  GROQ_FUNCTIONS,
  GROQ_NAMESPACED_FUNCTIONS,
} from './completionData.js';
import { CompletionItemKind } from 'vscode-languageserver';
import type { SchemaLoader } from '../schema/SchemaLoader.js';
import { inferTypeContext, inferTypeContextFromText, getAvailableFields, getReferenceTargetFields } from '../schema/TypeInference.js';
import type { ResolvedField } from '../schema/SchemaTypes.js';

type CompletionContext =
  | 'empty'
  | 'afterEverything'
  | 'insideFilter'
  | 'insideProjection'
  | 'afterDot'
  | 'afterArrow'
  | 'afterPipe'
  | 'functionArgs'
  | 'orderArgs'
  | 'general';

export function getAutocompleteSuggestions(
  source: string,
  root: SyntaxNode,
  position: Position,
  schemaLoader?: SchemaLoader
): CompletionItem[] {
  const context = determineCompletionContext(source, root, position);
  return getCompletionsForContext(context, source, root, position, schemaLoader);
}

function determineCompletionContext(
  source: string,
  root: SyntaxNode,
  position: Position
): CompletionContext {
  if (source.trim() === '') {
    return 'empty';
  }

  const charBefore = getCharacterBeforePosition(source, position);
  const node = getNodeAtPosition(root, position);

  if (charBefore === '.') {
    return 'afterDot';
  }

  if (charBefore === '|') {
    return 'afterPipe';
  }

  if (source.slice(-2) === '->') {
    return 'afterArrow';
  }

  // Handle boundary cases where cursor is at end of a token
  // and descendantForPosition returns source_file
  if (charBefore === '[') {
    return 'insideFilter';
  }

  if (charBefore === '{') {
    return 'insideProjection';
  }

  // Check if we're right after 'everything' (*)
  if (charBefore === '*' || source.trim() === '*') {
    return 'afterEverything';
  }

  // Check text-based heuristics for incomplete expressions
  const textBeforeCursor = source.substring(0, positionToOffset(source, position));
  if (isInsideFilterBracket(textBeforeCursor)) {
    return 'insideFilter';
  }
  if (isInsideProjectionBrace(textBeforeCursor)) {
    return 'insideProjection';
  }

  if (node) {
    if (node.type === 'everything') {
      return 'afterEverything';
    }

    const subscriptAncestor = findAncestorOfType(node, 'subscript_expression');
    if (subscriptAncestor) {
      const baseField = getFieldNode(subscriptAncestor, 'base');
      if (baseField && node.startIndex > baseField.endIndex) {
        return 'insideFilter';
      }
    }

    const projectionAncestor = findAncestorOfType(node, ['projection', 'projection_expression']);
    if (projectionAncestor) {
      return 'insideProjection';
    }

    const functionCallAncestor = findAncestorOfType(node, 'function_call');
    if (functionCallAncestor) {
      const nameNode = getFieldNode(functionCallAncestor, 'name');
      if (nameNode?.text === 'order') {
        return 'orderArgs';
      }
      return 'functionArgs';
    }
  }

  return 'general';
}

function isInsideFilterBracket(text: string): boolean {
  let bracketDepth = 0;
  let braceDepth = 0;
  for (const char of text) {
    if (char === '[') bracketDepth++;
    else if (char === ']') bracketDepth--;
    else if (char === '{') braceDepth++;
    else if (char === '}') braceDepth--;
  }
  return bracketDepth > 0 && braceDepth === 0;
}

function isInsideProjectionBrace(text: string): boolean {
  let braceDepth = 0;
  for (const char of text) {
    if (char === '{') braceDepth++;
    else if (char === '}') braceDepth--;
  }
  return braceDepth > 0;
}

function getCompletionsForContext(
  context: CompletionContext,
  source: string,
  root: SyntaxNode,
  position: Position,
  schemaLoader?: SchemaLoader
): CompletionItem[] {
  const word = getWordAtPosition(source, position);
  const node = getNodeAtPosition(root, position);

  switch (context) {
    case 'empty':
      return [
        ...getSpecialCharCompletions(),
        ...getFunctionCompletions(),
        ...getKeywordCompletions(),
      ];

    case 'afterEverything':
      return getAfterEverythingCompletions();

    case 'insideFilter':
      return [
        ...getFilterStartCompletions(),
        ...getSchemaTypeCompletions(source, position, schemaLoader),
        ...getSchemaFieldCompletions(source, position, node, schemaLoader),
        ...getKeywordCompletions(),
        ...getFunctionCompletions(),
        ...getVariableCompletions(root),
      ].filter((item) => !word || item.label.toLowerCase().startsWith(word.toLowerCase()));

    case 'insideProjection':
      return [
        ...getProjectionCompletions(),
        ...getSchemaFieldCompletions(source, position, node, schemaLoader),
        ...getFunctionCompletions(),
      ].filter((item) => !word || item.label.toLowerCase().startsWith(word.toLowerCase()));

    case 'afterDot':
      return [
        ...getSchemaFieldCompletions(source, position, node, schemaLoader),
        ...getFieldCompletions(),
        ...getSpecialCharCompletions().filter((c) => c.label === '@' || c.label === '^'),
      ];

    case 'afterArrow':
      return [
        ...getReferenceFieldCompletions(node, schemaLoader),
        ...getFieldCompletions(),
      ];

    case 'afterPipe':
      return getPipeCompletions();

    case 'orderArgs':
      return [
        { label: 'asc', kind: CompletionItemKind.Keyword, documentation: 'Ascending order' },
        { label: 'desc', kind: CompletionItemKind.Keyword, documentation: 'Descending order' },
      ];

    case 'functionArgs':
      return [
        ...getSchemaFieldCompletions(source, position, node, schemaLoader),
        ...getFieldCompletions(),
        ...getVariableCompletions(root),
      ];

    case 'general':
    default:
      return [
        ...getSpecialCharCompletions(),
        ...getKeywordCompletions(),
        ...getFunctionCompletions(),
        ...getVariableCompletions(root),
      ].filter((item) => !word || item.label.toLowerCase().startsWith(word.toLowerCase()));
  }
}

function getFieldCompletions(): CompletionItem[] {
  return [
    { label: '_id', kind: CompletionItemKind.Field, detail: 'Document ID' },
    { label: '_type', kind: CompletionItemKind.Field, detail: 'Document type' },
    { label: '_createdAt', kind: CompletionItemKind.Field, detail: 'Creation timestamp' },
    { label: '_updatedAt', kind: CompletionItemKind.Field, detail: 'Last update timestamp' },
    { label: '_rev', kind: CompletionItemKind.Field, detail: 'Document revision' },
  ];
}

function getVariableCompletions(root: SyntaxNode): CompletionItem[] {
  const variables = new Set<string>();
  collectVariables(root, variables);

  return Array.from(variables).map((v) => ({
    label: v,
    kind: CompletionItemKind.Variable,
    detail: 'Query parameter',
  }));
}

function collectVariables(node: SyntaxNode, variables: Set<string>): void {
  if (node.type === 'variable') {
    variables.add(node.text);
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) {
      collectVariables(child, variables);
    }
  }
}

export function getFunctionSignature(name: string): string | null {
  const fn = GROQ_FUNCTIONS.find((f) => f.name === name);
  if (fn) return fn.signature;

  const namespacedFn = GROQ_NAMESPACED_FUNCTIONS.find((f) => f.name === name);
  return namespacedFn?.signature ?? null;
}

function getSchemaTypeCompletions(
  source: string,
  position: Position,
  schemaLoader?: SchemaLoader
): CompletionItem[] {
  if (!schemaLoader?.isLoaded()) return [];

  const textBeforeCursor = source.substring(0, positionToOffset(source, position));
  const typeEqualPattern = /_type\s*==\s*["']?$/;
  if (!typeEqualPattern.test(textBeforeCursor)) return [];

  return schemaLoader.getDocumentTypeNames().map((typeName) => ({
    label: `"${typeName}"`,
    kind: CompletionItemKind.Value,
    detail: 'Document type',
    insertText: `"${typeName}"`,
  }));
}

function getSchemaFieldCompletions(
  source: string,
  position: Position,
  node: SyntaxNode | null,
  schemaLoader?: SchemaLoader
): CompletionItem[] {
  if (!schemaLoader?.isLoaded()) return [];

  // Try AST-based inference first
  let context = node ? inferTypeContext(node, schemaLoader) : null;

  // If AST-based inference didn't find a specific type, try text-based inference
  if (!context?.type) {
    context = inferTypeContextFromText(source, position, schemaLoader);
  }

  if (!context) return [];

  const fields = getAvailableFields(context, schemaLoader);
  return fields.map((field, index) => resolvedFieldToCompletion(field, index));
}

function getReferenceFieldCompletions(
  node: SyntaxNode | null,
  schemaLoader?: SchemaLoader
): CompletionItem[] {
  if (!schemaLoader?.isLoaded() || !node) return [];

  const derefExpr = findAncestorOfType(node, 'dereference_expression');
  if (!derefExpr) return [];

  const baseNode = getFieldNode(derefExpr, 'base');
  if (!baseNode) return [];

  const context = inferTypeContext(baseNode, schemaLoader);
  if (!context.field?.isReference) return [];

  const fields = getReferenceTargetFields(context.field, schemaLoader);
  return fields.map((field) => resolvedFieldToCompletion(field));
}

function resolvedFieldToCompletion(field: ResolvedField, index: number = 0): CompletionItem {
  let detail = field.type;
  if (field.isReference && field.referenceTargets?.length) {
    detail = `reference → ${field.referenceTargets.join(' | ')}`;
  } else if (field.isArray && field.arrayOf?.length) {
    detail = `array<${field.arrayOf.join(' | ')}>`;
  }

  return {
    label: field.name,
    kind: CompletionItemKind.Field,
    detail,
    documentation: field.description,
    sortText: `0-${String(index).padStart(4, '0')}-${field.name}`,
  };
}

function positionToOffset(source: string, position: Position): number {
  const lines = source.split('\n');
  let offset = 0;
  for (let i = 0; i < position.line && i < lines.length; i++) {
    offset += lines[i].length + 1;
  }
  return offset + position.character;
}
