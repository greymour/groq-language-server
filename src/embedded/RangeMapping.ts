import type { Position, Range } from "../parser/ASTTypes";

export interface RangeMapper {
  toEmbedded(position: Position): Position;
  toDocument(position: Position): Position;
  toEmbeddedRange(range: Range): Range;
  toDocumentRange(range: Range): Range;
}

export function createRangeMapper(embeddedStart: Position): RangeMapper {
  return {
    toEmbedded(position: Position): Position {
      const relativeLine = position.line - embeddedStart.line;
      let character = position.character;
      if (relativeLine === 0) {
        character -= embeddedStart.character;
      }
      return { line: relativeLine, character: Math.max(0, character) };
    },

    toDocument(position: Position): Position {
      const absoluteLine = position.line + embeddedStart.line;
      let character = position.character;
      if (position.line === 0) {
        character += embeddedStart.character;
      }
      return { line: absoluteLine, character };
    },

    toEmbeddedRange(range: Range): Range {
      return {
        start: this.toEmbedded(range.start),
        end: this.toEmbedded(range.end),
      };
    },

    toDocumentRange(range: Range): Range {
      return {
        start: this.toDocument(range.start),
        end: this.toDocument(range.end),
      };
    },
  };
}

export function adjustRangeForEmbedded(
  range: Range,
  embeddedStart: Position
): Range {
  const mapper = createRangeMapper(embeddedStart);
  return mapper.toDocumentRange(range);
}

export function adjustPositionForEmbedded(
  position: Position,
  embeddedStart: Position
): Position {
  const mapper = createRangeMapper(embeddedStart);
  return mapper.toDocument(position);
}
