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
    score: similarityScore(targetLower, type.toLowerCase()),
  }));

  scored.sort((a, b) => b.score - a.score);

  const topMatches = scored.slice(0, 5).filter(s => s.score > 0);
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
 * Calculate similarity score between two strings.
 * Higher score = more similar.
 */
function similarityScore(target: string, candidate: string): number {
  let score = 0;

  // Exact substring match (highest priority)
  if (candidate.includes(target) || target.includes(candidate)) {
    score += 100;
  }

  // Common prefix
  let prefixLen = 0;
  while (prefixLen < target.length && prefixLen < candidate.length && target[prefixLen] === candidate[prefixLen]) {
    prefixLen++;
  }
  score += prefixLen * 10;

  // Common suffix
  let suffixLen = 0;
  while (
    suffixLen < target.length &&
    suffixLen < candidate.length &&
    target[target.length - 1 - suffixLen] === candidate[candidate.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }
  score += suffixLen * 5;

  // Levenshtein-inspired: penalize length difference
  const lenDiff = Math.abs(target.length - candidate.length);
  score -= lenDiff * 2;

  return score;
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
