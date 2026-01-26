import type { Position } from '../parser/ASTTypes.js';

export function offsetToPosition(text: string, offset: number): Position {
  let line = 0;
  let character = 0;

  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      character = 0;
    } else {
      character++;
    }
  }

  return { line, character };
}

export function positionToOffset(text: string, position: Position): number {
  let offset = 0;
  let currentLine = 0;

  for (let i = 0; i < text.length; i++) {
    if (currentLine === position.line) {
      return offset + position.character;
    }
    if (text[i] === '\n') {
      currentLine++;
    }
    offset++;
  }

  if (currentLine === position.line) {
    return offset + position.character;
  }

  return text.length;
}

export function getLineText(text: string, line: number): string {
  const lines = text.split('\n');
  return lines[line] ?? '';
}

export function getCharacterBeforePosition(text: string, position: Position): string {
  const lineText = getLineText(text, position.line);
  if (position.character > 0) {
    return lineText[position.character - 1] ?? '';
  }
  return '';
}

export function getWordAtPosition(text: string, position: Position): string {
  const lineText = getLineText(text, position.line);
  const before = lineText.slice(0, position.character);
  const after = lineText.slice(position.character);

  const wordBefore = before.match(/[_A-Za-z$][_0-9A-Za-z]*$/)?.[0] ?? '';
  const wordAfter = after.match(/^[_0-9A-Za-z]*/)?.[0] ?? '';

  return wordBefore + wordAfter;
}

export function getWordRangeAtPosition(
  text: string,
  position: Position
): { start: Position; end: Position } | null {
  const lineText = getLineText(text, position.line);
  const before = lineText.slice(0, position.character);
  const after = lineText.slice(position.character);

  const wordBefore = before.match(/[_A-Za-z$][_0-9A-Za-z]*$/)?.[0] ?? '';
  const wordAfter = after.match(/^[_0-9A-Za-z]*/)?.[0] ?? '';

  if (!wordBefore && !wordAfter) {
    return null;
  }

  return {
    start: { line: position.line, character: position.character - wordBefore.length },
    end: { line: position.line, character: position.character + wordAfter.length },
  };
}

export function comparePositions(a: Position, b: Position): number {
  if (a.line !== b.line) {
    return a.line - b.line;
  }
  return a.character - b.character;
}

export function positionBefore(a: Position, b: Position): boolean {
  return comparePositions(a, b) < 0;
}

export function positionAfter(a: Position, b: Position): boolean {
  return comparePositions(a, b) > 0;
}

export function positionEquals(a: Position, b: Position): boolean {
  return a.line === b.line && a.character === b.character;
}

export function getNamespacePrefixAtPosition(text: string, position: Position): string | null {
  const lineText = getLineText(text, position.line);
  const before = lineText.slice(0, position.character);

  // Match patterns like "custom::" or "geo::" at the end
  const namespaceMatch = before.match(/([_A-Za-z][_0-9A-Za-z]*)::([_A-Za-z][_0-9A-Za-z]*)?$/);
  if (namespaceMatch) {
    return namespaceMatch[1];
  }
  return null;
}
