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
} from './completionData.js';
import { CompletionItemKind } from 'vscode-languageserver';

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
  position: Position
): CompletionItem[] {
  const context = determineCompletionContext(source, root, position);
  return getCompletionsForContext(context, source, root, position);
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

  if (node) {
    if (node.type === 'everything' || (node.parent?.type === 'source_file' && source.trim() === '*')) {
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

function getCompletionsForContext(
  context: CompletionContext,
  source: string,
  root: SyntaxNode,
  position: Position
): CompletionItem[] {
  const word = getWordAtPosition(source, position);

  switch (context) {
    case 'empty':
      return [
        ...getSpecialCharCompletions(),
        ...getFunctionCompletions(),
      ];

    case 'afterEverything':
      return getAfterEverythingCompletions();

    case 'insideFilter':
      return [
        ...getFilterStartCompletions(),
        ...getKeywordCompletions(),
        ...getFunctionCompletions(),
        ...getVariableCompletions(root),
      ].filter((item) => !word || item.label.toLowerCase().startsWith(word.toLowerCase()));

    case 'insideProjection':
      return [
        ...getProjectionCompletions(),
        ...getFunctionCompletions(),
      ].filter((item) => !word || item.label.toLowerCase().startsWith(word.toLowerCase()));

    case 'afterDot':
      return [
        ...getFieldCompletions(),
        ...getSpecialCharCompletions().filter((c) => c.label === '@' || c.label === '^'),
      ];

    case 'afterArrow':
      return getFieldCompletions();

    case 'afterPipe':
      return getPipeCompletions();

    case 'orderArgs':
      return [
        { label: 'asc', kind: CompletionItemKind.Keyword, documentation: 'Ascending order' },
        { label: 'desc', kind: CompletionItemKind.Keyword, documentation: 'Descending order' },
      ];

    case 'functionArgs':
      return [
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
  return fn?.signature ?? null;
}
