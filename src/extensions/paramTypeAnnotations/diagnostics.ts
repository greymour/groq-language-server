import type { Diagnostic } from 'vscode-languageserver';
import { DiagnosticSeverity } from 'vscode-languageserver';
import type { DiagnosticsContext } from '../index';

/**
 * Validate that all declared parameter types exist in the schema.
 * Returns warnings for types that don't exist.
 */
export function validateParamTypes(context: DiagnosticsContext): Diagnostic[] {
  const { functionDefinitions, schemaLoader, source } = context;
  const diagnostics: Diagnostic[] = [];

  if (!schemaLoader.isLoaded()) {
    return diagnostics;
  }

  for (const funcDef of functionDefinitions) {
    for (const param of funcDef.parameters) {
      if (param.declaredType && !schemaLoader.getType(param.declaredType)) {
        const availableTypes = schemaLoader.getTypeNames();
        const similarTypes = findSimilarTypes(param.declaredType, availableTypes);
        const range = param.typeAnnotationRange
          ? offsetRangeToLSPRange(source, param.typeAnnotationRange.startIndex, param.typeAnnotationRange.endIndex)
          : { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };

        diagnostics.push({
          severity: DiagnosticSeverity.Warning,
          range,
          message: `Type "${param.declaredType}" not found in schema. ${similarTypes}`,
          source: 'groq-ext:paramTypeAnnotations',
        });
      }
    }
  }

  return diagnostics;
}

/**
 * Find types similar to the target and format a helpful message.
 */
function findSimilarTypes(target: string, availableTypes: string[]): string {
  if (availableTypes.length === 0) {
    return 'No types available in schema.';
  }

  const targetLower = target.toLowerCase();
  const scored = availableTypes.map(type => ({
    type,
    distance: levenshteinDistance(targetLower, type.toLowerCase()),
  }));

  scored.sort((a, b) => a.distance - b.distance);

  // Only show types within a reasonable edit distance (half the target length, minimum 5)
  const maxDistance = Math.max(5, Math.floor(target.length / 2));
  const topMatches = scored.slice(0, 5).filter(s => s.distance <= maxDistance);
  const remaining = availableTypes.length - topMatches.length;

  if (topMatches.length === 0) {
    const sample = availableTypes.slice(0, 5);
    const suffix = remaining > 0 ? ` (and ${availableTypes.length - 5} more)` : '';
    return `Available types: ${sample.join(', ')}${suffix}`;
  }

  const suggestions = topMatches.map(s => s.type).join(', ');
  const suffix = remaining > 0 ? ` (and ${remaining} more)` : '';
  return `Similar types: ${suggestions}${suffix}`;
}

/**
 * Calculate Levenshtein distance between two strings.
 * Returns the minimum number of single-character edits (insertions, deletions, substitutions)
 * required to transform one string into the other.
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Use two rows instead of full matrix for space efficiency
  let prevRow = new Array<number>(b.length + 1);
  let currRow = new Array<number>(b.length + 1);

  for (let j = 0; j <= b.length; j++) {
    prevRow[j] = j;
  }

  for (let i = 1; i <= a.length; i++) {
    currRow[0] = i;

    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1,      // deletion
        currRow[j - 1] + 1,  // insertion
        prevRow[j - 1] + cost // substitution
      );
    }

    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[b.length];
}

/**
 * Convert character offset range to LSP line/character range.
 */
function offsetRangeToLSPRange(
  source: string,
  startOffset: number,
  endOffset: number
): { start: { line: number; character: number }; end: { line: number; character: number } } {
  let line = 0;
  let character = 0;
  let startLine = 0;
  let startCharacter = 0;

  for (let i = 0; i < endOffset && i < source.length; i++) {
    if (i === startOffset) {
      startLine = line;
      startCharacter = character;
    }
    if (source[i] === '\n') {
      line++;
      character = 0;
    } else {
      character++;
    }
  }

  return {
    start: { line: startLine, character: startCharacter },
    end: { line, character },
  };
}
