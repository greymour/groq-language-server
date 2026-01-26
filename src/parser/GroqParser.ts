import Parser from 'tree-sitter';
import type { Tree, SyntaxNode, ParseResult, ParseError, Range } from './ASTTypes';
import { nodeToRange } from './ASTTypes';
import { collectAllErrors } from './nodeUtils';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const GroqLanguage = require('tree-sitter-groq') as Parser.Language;

export class GroqParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
    this.parser.setLanguage(GroqLanguage);
  }

  parse(source: string, previousTree?: Tree): ParseResult {
    const tree = this.parser.parse(source, previousTree);
    const errors = this.extractErrors(tree.rootNode);

    return {
      tree,
      hasErrors: errors.length > 0,
      errors,
    };
  }

  parseIncremental(
    source: string,
    previousTree: Tree,
    startIndex: number,
    oldEndIndex: number,
    newEndIndex: number,
    startPosition: { row: number; column: number },
    oldEndPosition: { row: number; column: number },
    newEndPosition: { row: number; column: number }
  ): ParseResult {
    previousTree.edit({
      startIndex,
      oldEndIndex,
      newEndIndex,
      startPosition,
      oldEndPosition,
      newEndPosition,
    });

    return this.parse(source, previousTree);
  }

  private extractErrors(root: SyntaxNode): ParseError[] {
    const errorNodes = collectAllErrors(root);
    return errorNodes.map((node) => this.createParseError(node));
  }

  private createParseError(node: SyntaxNode): ParseError {
    const range: Range = nodeToRange(node);
    let message: string;

    if (node.isMissing) {
      message = `Missing ${node.type}`;
    } else if (node.type === 'ERROR') {
      message = this.inferErrorMessage(node);
    } else {
      message = `Syntax error at ${node.type}`;
    }

    return { message, range, node };
  }

  private inferErrorMessage(errorNode: SyntaxNode): string {
    const text = errorNode.text.trim();
    const parent = errorNode.parent;
    const prevSibling = errorNode.previousSibling;

    if (!text) {
      return 'Unexpected end of input';
    }

    if (parent?.type === 'subscript_expression') {
      if (prevSibling?.type === '[') {
        return `Invalid filter or subscript expression: "${text}"`;
      }
      return 'Expected closing bracket ]';
    }

    if (parent?.type === 'projection' || parent?.type === 'projection_expression') {
      return `Invalid projection syntax: "${text}"`;
    }

    if (parent?.type === 'function_call') {
      return `Invalid function argument: "${text}"`;
    }

    if (text.startsWith('$')) {
      return `Invalid variable name: "${text}"`;
    }

    if (/^[0-9]/.test(text)) {
      return `Invalid number: "${text}"`;
    }

    if (text === '"' || text === "'") {
      return 'Unclosed string';
    }

    return `Unexpected token: "${text}"`;
  }

  getLanguage(): Parser.Language {
    return GroqLanguage;
  }
}

let sharedParser: GroqParser | null = null;

export function getSharedParser(): GroqParser {
  if (!sharedParser) {
    sharedParser = new GroqParser();
  }
  return sharedParser;
}
