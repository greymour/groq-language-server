import type { Position, Range } from "../parser/ASTTypes";
import type { EmbeddedQuery, InterpolationRange } from "./findGroqTags";
import { findGroqTags } from "./findGroqTags";
import { createRangeMapper } from "./RangeMapping";
import { rangesOverlap, positionInRange } from "../utils/Range";

export class EmbeddedLanguageHandler {
  private cache: Map<string, EmbeddedQuery[]> = new Map();

  update(uri: string, source: string): void {
    this.cache.set(uri, findGroqTags(source));
  }

  remove(uri: string): void {
    this.cache.delete(uri);
  }

  getQueries(uri: string): EmbeddedQuery[] {
    return this.cache.get(uri) ?? [];
  }

  getQueryAtPosition(uri: string, position: Position): EmbeddedQuery | null {
    const queries = this.cache.get(uri);
    if (!queries) return null;
    return queries.find((q) => positionInRange(position, q.range)) ?? null;
  }

  toEmbeddedPosition(query: EmbeddedQuery, position: Position): Position {
    return createRangeMapper(query.range.start).toEmbedded(position);
  }

  toDocumentRange(query: EmbeddedQuery, range: Range): Range {
    return createRangeMapper(query.range.start).toDocumentRange(range);
  }

  filterInterpolationDiagnostics<T extends { range: Range }>(
    items: T[],
    interpolationRanges: InterpolationRange[]
  ): T[] {
    return items.filter(
      (item) => !interpolationRanges.some((ir) => rangesOverlap(item.range, ir))
    );
  }

  mapResultsToDocument<T extends { range: Range }>(
    query: EmbeddedQuery,
    items: T[]
  ): T[] {
    const mapper = createRangeMapper(query.range.start);
    return items.map((item) => ({
      ...item,
      range: mapper.toDocumentRange(item.range),
    }));
  }
}
