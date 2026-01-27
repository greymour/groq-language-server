import type { Position } from 'vscode-languageserver';
import type { SyntaxNode } from '../parser/ASTTypes';
import { getNodeAtPosition, findAncestorOfType, getFieldNode } from '../parser/nodeUtils';
import { getCharacterBeforePosition, getWordAtPosition, getNamespacePrefixAtPosition, positionToOffset } from '../utils/positionUtils';

export type CompletionContext =
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

export interface AnalyzedContext {
  context: CompletionContext;
  node: SyntaxNode | null;
  charBefore: string;
  namespacePrefix: string | null;
  currentWord: string;
}

export function analyzeCompletionContext(
  source: string,
  root: SyntaxNode,
  position: Position
): AnalyzedContext {
  const charBefore = getCharacterBeforePosition(source, position);
  const node = getNodeAtPosition(root, position);
  const context = determineContext(source, root, position, charBefore, node);

  return {
    context,
    node,
    charBefore,
    namespacePrefix: getNamespacePrefixAtPosition(source, position),
    currentWord: getWordAtPosition(source, position),
  };
}

function determineContext(
  source: string,
  _root: SyntaxNode,
  position: Position,
  charBefore: string,
  node: SyntaxNode | null
): CompletionContext {
  if (source.trim() === '') return 'empty';

  const charContexts: Partial<Record<string, CompletionContext>> = {
    '.': 'afterDot',
    '|': 'afterPipe',
    '[': 'insideFilter',
    '{': 'insideProjection',
    '*': 'afterEverything',
  };

  if (charBefore in charContexts) {
    return charContexts[charBefore]!;
  }

  if (source.slice(-2) === '->') return 'afterArrow';
  if (source.trim() === '*') return 'afterEverything';

  const textBeforeCursor = source.substring(0, positionToOffset(source, position));
  if (isInsideUnclosedBracket(textBeforeCursor)) return 'insideFilter';
  if (isInsideUnclosedBrace(textBeforeCursor)) return 'insideProjection';

  if (node) {
    if (node.type === 'everything') return 'afterEverything';

    const subscriptAncestor = findAncestorOfType(node, 'subscript_expression');
    if (subscriptAncestor) {
      const baseField = getFieldNode(subscriptAncestor, 'base');
      if (baseField && node.startIndex > baseField.endIndex) {
        return 'insideFilter';
      }
    }

    const projectionAncestor = findAncestorOfType(node, ['projection', 'projection_expression']);
    if (projectionAncestor) return 'insideProjection';

    const functionCallAncestor = findAncestorOfType(node, 'function_call');
    if (functionCallAncestor) {
      const nameNode = getFieldNode(functionCallAncestor, 'name');
      if (nameNode?.text === 'order') return 'orderArgs';
      return 'functionArgs';
    }
  }

  return 'general';
}

function isInsideUnclosedBracket(text: string): boolean {
  return countUnmatched(text, '[', ']') > 0 && countUnmatched(text, '{', '}') === 0;
}

function isInsideUnclosedBrace(text: string): boolean {
  return countUnmatched(text, '{', '}') > 0;
}

function countUnmatched(text: string, open: string, close: string): number {
  let depth = 0;
  for (const char of text) {
    if (char === open) depth++;
    else if (char === close) depth--;
  }
  return depth;
}
