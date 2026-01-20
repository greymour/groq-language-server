import type { ParseResult, Range, Position } from '../parser/ASTTypes.js';
import { getSharedParser } from '../parser/GroqParser.js';

export interface EmbeddedQuery {
  content: string;
  range: Range;
  parseResult: ParseResult;
}

interface TagLocation {
  content: string;
  start: Position;
  end: Position;
}

export function findGroqTags(source: string): EmbeddedQuery[] {
  const tagLocations = extractGroqTagLocations(source);
  const parser = getSharedParser();

  return tagLocations.map((loc) => ({
    content: loc.content,
    range: { start: loc.start, end: loc.end },
    parseResult: parser.parse(loc.content),
  }));
}

function extractGroqTagLocations(source: string): TagLocation[] {
  const locations: TagLocation[] = [];

  const groqTagRegex = /groq\s*`([^`]*)`/g;
  const defineQueryRegex = /defineQuery\s*\(\s*`([^`]*)`\s*\)/g;

  let match: RegExpExecArray | null;

  while ((match = groqTagRegex.exec(source)) !== null) {
    const fullMatch = match[0];
    const content = match[1];
    const startOffset = match.index + fullMatch.indexOf('`') + 1;

    locations.push({
      content,
      start: offsetToPosition(source, startOffset),
      end: offsetToPosition(source, startOffset + content.length),
    });
  }

  while ((match = defineQueryRegex.exec(source)) !== null) {
    const fullMatch = match[0];
    const content = match[1];
    const startOffset = match.index + fullMatch.indexOf('`') + 1;

    locations.push({
      content,
      start: offsetToPosition(source, startOffset),
      end: offsetToPosition(source, startOffset + content.length),
    });
  }

  return locations;
}

function offsetToPosition(text: string, offset: number): Position {
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

export function isInsideGroqTag(source: string, position: Position): boolean {
  const tags = extractGroqTagLocations(source);

  for (const tag of tags) {
    if (
      position.line >= tag.start.line &&
      position.line <= tag.end.line
    ) {
      if (position.line === tag.start.line && position.character < tag.start.character) {
        continue;
      }
      if (position.line === tag.end.line && position.character > tag.end.character) {
        continue;
      }
      return true;
    }
  }

  return false;
}

export function getGroqTagAtPosition(
  source: string,
  position: Position
): EmbeddedQuery | null {
  const tags = findGroqTags(source);

  for (const tag of tags) {
    if (
      position.line >= tag.range.start.line &&
      position.line <= tag.range.end.line
    ) {
      if (position.line === tag.range.start.line && position.character < tag.range.start.character) {
        continue;
      }
      if (position.line === tag.range.end.line && position.character > tag.range.end.character) {
        continue;
      }
      return tag;
    }
  }

  return null;
}
