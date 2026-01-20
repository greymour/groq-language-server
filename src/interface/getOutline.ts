import type { SymbolInformation } from 'vscode-languageserver';
import { SymbolKind } from 'vscode-languageserver';
import type { SyntaxNode } from '../parser/ASTTypes.js';
import { nodeToRange } from '../parser/ASTTypes.js';
import { toLSPRange } from '../utils/Range.js';
import { walkTree, getFieldNode } from '../parser/nodeUtils.js';

export function getOutline(root: SyntaxNode, uri: string): SymbolInformation[] {
  const symbols: SymbolInformation[] = [];

  walkTree(root, (node) => {
    const symbol = nodeToSymbol(node, uri);
    if (symbol) {
      symbols.push(symbol);
    }
  });

  return symbols;
}

function nodeToSymbol(node: SyntaxNode, uri: string): SymbolInformation | null {
  switch (node.type) {
    case 'function_call': {
      const nameNode = getFieldNode(node, 'name');
      if (nameNode) {
        return {
          name: `${nameNode.text}()`,
          kind: SymbolKind.Function,
          location: {
            uri,
            range: toLSPRange(nodeToRange(node)),
          },
        };
      }
      return null;
    }

    case 'projection_pair': {
      const keyNode = getFieldNode(node, 'key');
      if (keyNode) {
        const keyText = keyNode.type === 'string'
          ? keyNode.text.slice(1, -1)
          : keyNode.text;
        return {
          name: keyText,
          kind: SymbolKind.Field,
          location: {
            uri,
            range: toLSPRange(nodeToRange(node)),
          },
        };
      }
      return null;
    }

    case 'variable': {
      return {
        name: node.text,
        kind: SymbolKind.Variable,
        location: {
          uri,
          range: toLSPRange(nodeToRange(node)),
        },
      };
    }

    case 'subscript_expression': {
      const indexNode = getFieldNode(node, 'index');
      if (indexNode && isTypeFilter(indexNode)) {
        const typeValue = extractTypeValue(indexNode);
        if (typeValue) {
          return {
            name: `[_type == "${typeValue}"]`,
            kind: SymbolKind.Class,
            location: {
              uri,
              range: toLSPRange(nodeToRange(node)),
            },
          };
        }
      }
      return null;
    }

    case 'pipe_expression': {
      const rightNode = getFieldNode(node, 'right');
      if (rightNode?.type === 'function_call') {
        const nameNode = getFieldNode(rightNode, 'name');
        if (nameNode?.text === 'order') {
          return {
            name: '| order(...)',
            kind: SymbolKind.Operator,
            location: {
              uri,
              range: toLSPRange(nodeToRange(node)),
            },
          };
        }
        if (nameNode?.text === 'score') {
          return {
            name: '| score(...)',
            kind: SymbolKind.Operator,
            location: {
              uri,
              range: toLSPRange(nodeToRange(node)),
            },
          };
        }
      }
      return null;
    }

    default:
      return null;
  }
}

function isTypeFilter(node: SyntaxNode): boolean {
  if (node.type === 'comparison_expression') {
    const left = getFieldNode(node, 'left');
    const operator = getFieldNode(node, 'operator');
    if (left?.type === 'identifier' && left.text === '_type' && operator?.text === '==') {
      return true;
    }
  }
  return false;
}

function extractTypeValue(node: SyntaxNode): string | null {
  if (node.type === 'comparison_expression') {
    const right = getFieldNode(node, 'right');
    if (right?.type === 'string') {
      const text = right.text;
      if ((text.startsWith('"') && text.endsWith('"')) ||
          (text.startsWith("'") && text.endsWith("'"))) {
        return text.slice(1, -1);
      }
    }
  }
  return null;
}
