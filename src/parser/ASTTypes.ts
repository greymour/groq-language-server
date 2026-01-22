import type Parser from 'tree-sitter';

export type SyntaxNode = Parser.SyntaxNode;
export type Tree = Parser.Tree;
export type Point = Parser.Point;

export type GroqNodeType =
  | 'source_file'
  | 'identifier'
  | 'variable'
  | 'this'
  | 'parent'
  | 'everything'
  | 'null'
  | 'true'
  | 'false'
  | 'number'
  | 'string'
  | 'double_quoted_string'
  | 'single_quoted_string'
  | 'escape_sequence'
  | 'parenthesized_expression'
  | 'unary_expression'
  | 'not_expression'
  | 'binary_expression'
  | 'and_expression'
  | 'or_expression'
  | 'comparison_expression'
  | 'in_expression'
  | 'match_expression'
  | 'pipe_expression'
  | 'access_expression'
  | 'subscript_expression'
  | 'dereference_expression'
  | 'projection_expression'
  | 'projection'
  | 'projection_pair'
  | 'spread'
  | 'pair'
  | 'asc_expression'
  | 'desc_expression'
  | 'array'
  | 'object'
  | 'object_pair'
  | 'function_call'
  | 'function_definition'
  | 'parameter_list'
  | 'namespaced_identifier'
  | 'comment'
  | 'ERROR';

export const EXPRESSION_TYPES: ReadonlySet<GroqNodeType> = new Set([
  'identifier',
  'variable',
  'this',
  'parent',
  'everything',
  'null',
  'true',
  'false',
  'number',
  'string',
  'parenthesized_expression',
  'unary_expression',
  'not_expression',
  'binary_expression',
  'and_expression',
  'or_expression',
  'comparison_expression',
  'in_expression',
  'match_expression',
  'pipe_expression',
  'access_expression',
  'subscript_expression',
  'dereference_expression',
  'projection_expression',
  'pair',
  'asc_expression',
  'desc_expression',
  'array',
  'object',
  'function_call',
]);

export const LITERAL_TYPES: ReadonlySet<GroqNodeType> = new Set([
  'null',
  'true',
  'false',
  'number',
  'string',
]);

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface ParseResult {
  tree: Tree;
  hasErrors: boolean;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  range: Range;
  node: SyntaxNode;
}

export function pointToPosition(point: Point): Position {
  return {
    line: point.row,
    character: point.column,
  };
}

export function nodeToRange(node: SyntaxNode): Range {
  return {
    start: pointToPosition(node.startPosition),
    end: pointToPosition(node.endPosition),
  };
}

export function isExpressionNode(node: SyntaxNode): boolean {
  return EXPRESSION_TYPES.has(node.type as GroqNodeType);
}

export function isLiteralNode(node: SyntaxNode): boolean {
  return LITERAL_TYPES.has(node.type as GroqNodeType);
}
