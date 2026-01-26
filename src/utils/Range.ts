import type { Position, Range } from '../parser/ASTTypes';
import type { Range as LSPRange, Position as LSPPosition } from 'vscode-languageserver';

export function toLSPPosition(position: Position): LSPPosition {
  return {
    line: position.line,
    character: position.character,
  };
}

export function fromLSPPosition(position: LSPPosition): Position {
  return {
    line: position.line,
    character: position.character,
  };
}

export function toLSPRange(range: Range): LSPRange {
  return {
    start: toLSPPosition(range.start),
    end: toLSPPosition(range.end),
  };
}

export function fromLSPRange(range: LSPRange): Range {
  return {
    start: fromLSPPosition(range.start),
    end: fromLSPPosition(range.end),
  };
}

export function createRange(
  startLine: number,
  startCharacter: number,
  endLine: number,
  endCharacter: number
): Range {
  return {
    start: { line: startLine, character: startCharacter },
    end: { line: endLine, character: endCharacter },
  };
}

export function positionInRange(position: Position, range: Range): boolean {
  if (position.line < range.start.line) return false;
  if (position.line > range.end.line) return false;
  if (position.line === range.start.line && position.character < range.start.character) return false;
  if (position.line === range.end.line && position.character > range.end.character) return false;
  return true;
}

export function rangeContainsRange(outer: Range, inner: Range): boolean {
  return positionInRange(inner.start, outer) && positionInRange(inner.end, outer);
}

export function rangesOverlap(a: Range, b: Range): boolean {
  if (a.end.line < b.start.line) return false;
  if (b.end.line < a.start.line) return false;
  if (a.end.line === b.start.line && a.end.character < b.start.character) return false;
  if (b.end.line === a.start.line && b.end.character < a.start.character) return false;
  return true;
}
